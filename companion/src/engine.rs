use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};
const FORMATS: &str = "mov,matroska,webm,avi,mxf,mpegts,mpeg,flv,ogg,wav,mp3,aac,flac,asf";
#[derive(Clone)]
pub struct Engine {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
    pub untrunc: Option<PathBuf>,
    pub max_output: u64,
    pub timeout: Duration,
}
pub fn sha(path: &Path, cancel: &AtomicBool) -> Result<String, String> {
    if cancel.load(Ordering::SeqCst) {
        return Err("cancelled".into());
    }
    let mut f = File::open(path).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err("cancelled".into());
        }
        let n = f.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(format!("{:x}", h.finalize()))
}
impl Engine {
    pub fn run(
        &self,
        exe: &Path,
        args: &[String],
        dir: &Path,
        cancel: &AtomicBool,
        label: &str,
    ) -> Result<(bool, String, String), String> {
        let stdout = dir.join(format!("{label}.stdout"));
        let stderr = dir.join(format!("{label}.stderr"));
        let mut cmd = Command::new(exe);
        cmd.args(args)
            .current_dir(dir)
            .stdin(Stdio::null())
            .stdout(File::create(&stdout).map_err(|e| e.to_string())?)
            .stderr(File::create(&stderr).map_err(|e| e.to_string())?);
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            let max = self.max_output;
            unsafe {
                cmd.pre_exec(move || {
                    for (resource, limit) in
                        [(libc::RLIMIT_CPU, 3600u64), (libc::RLIMIT_FSIZE, max)]
                    {
                        let r = libc::rlimit {
                            rlim_cur: limit,
                            rlim_max: limit,
                        };
                        if libc::setrlimit(resource, &r) != 0 {
                            return Err(std::io::Error::last_os_error());
                        }
                    }
                    Ok(())
                });
            }
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Engine unavailable: {e}"))?;
        let started = Instant::now();
        let mut system = sysinfo::System::new();
        let success = loop {
            system.refresh_processes(
                sysinfo::ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(child.id())]),
                true,
            );
            let over_memory = system
                .process(sysinfo::Pid::from_u32(child.id()))
                .is_some_and(|p| p.memory() > 4 * 1024 * 1024 * 1024);
            let over_file = fs::read_dir(dir)
                .into_iter()
                .flatten()
                .flatten()
                .any(|e| e.metadata().is_ok_and(|m| m.len() > self.max_output));
            let over_log = [&stdout, &stderr]
                .iter()
                .any(|p| fs::metadata(p).is_ok_and(|m| m.len() > 8 * 1024 * 1024));
            if over_memory || over_file || over_log {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Engine memory, output, or log limit exceeded".into());
            }
            if cancel.load(Ordering::SeqCst) || started.elapsed() > self.timeout {
                let _ = child.kill();
                let _ = child.wait();
                return Err(if cancel.load(Ordering::SeqCst) {
                    "cancelled"
                } else {
                    "Engine time limit exceeded"
                }
                .into());
            }
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                break status.success();
            }
            thread::sleep(Duration::from_millis(30));
        };
        let read_limited = |p: &Path| -> String {
            let mut s = Vec::new();
            if let Ok(f) = File::open(p) {
                let _ = f.take(8 * 1024 * 1024).read_to_end(&mut s);
            }
            String::from_utf8_lossy(&s).into_owned()
        };
        Ok((success, read_limited(&stdout), read_limited(&stderr)))
    }
    pub fn probe(
        &self,
        input: &Path,
        dir: &Path,
        cancel: &AtomicBool,
        label: &str,
    ) -> Result<Value, String> {
        let args = vec![
            "-v",
            "error",
            "-max_alloc",
            "268435456",
            "-protocol_whitelist",
            "file,pipe",
            "-format_whitelist",
            FORMATS,
            "-count_packets",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            "-i",
        ]
        .into_iter()
        .map(String::from)
        .chain([input.to_string_lossy().into_owned()])
        .collect::<Vec<_>>();
        let (ok, out, err) = self.run(&self.ffprobe, &args, dir, cancel, label)?;
        if !ok {
            return Err(format!(
                "Input analysis failed: {}",
                err.chars().take(1800).collect::<String>()
            ));
        }
        let info: Value = serde_json::from_str(&out).map_err(|e| e.to_string())?;
        if !info["streams"].as_array().is_some_and(|s| {
            s.iter().any(|s| {
                matches!(s["codec_type"].as_str(), Some("audio" | "video"))
                    && s["nb_read_packets"]
                        .as_str()
                        .and_then(|p| p.parse::<u64>().ok())
                        .unwrap_or(0)
                        > 0
            })
        }) {
            return Err("No readable audio/video packets were found".into());
        }
        Ok(info)
    }
    pub fn repair(
        &self,
        input: &Path,
        reference: Option<&Path>,
        strategy: &str,
        dir: &Path,
        cancel: Arc<AtomicBool>,
        mut stage: impl FnMut(&str),
        report: &mut Value,
    ) -> Result<(PathBuf, bool), String> {
        report["inputSize"] = json!(fs::metadata(input).map_err(|e| e.to_string())?.len());
        report["inputSha256"] = json!(sha(input, &cancel)?);
        report["warnings"]=json!(["Successful decoding does not establish recovery of the original recording or its completeness. Metadata, timecode, and HDR fidelity are not fully verified."]);
        report["engineVersions"] = self.versions(dir, &cancel);
        stage("probing");
        let probe = self.probe(input, dir, &cancel, "input-probe");
        let reference_mode = strategy == "reference"
            || (strategy == "auto" && probe.is_err() && reference.is_some());
        let mut working = input.to_path_buf();
        let mut info = probe.as_ref().ok().cloned();
        if reference_mode {
            report["strategy"] = json!("reference");
            let donor = reference.ok_or("A reference file is required")?;
            let donor_info = self.probe(donor, dir, &cancel, "donor-probe")?;
            report["reference"] = json!({"sha256":sha(donor,&cancel)?,"streams":donor_info["streams"],"format":donor_info["format"]});
            if let Some(original) = &info {
                check_donor(original, &donor_info)?;
            } else {
                report["warnings"].as_array_mut().unwrap().push(json!("Input metadata is unavailable; donor codec, resolution, frame rate and recording-mode compatibility cannot be established."));
            }
            report["warnings"].as_array_mut().unwrap().push(json!("Reference reconstruction is experimental. Native Sony RSV recovery has not been verified with camera fixtures."));
            let exe=self.untrunc.as_ref().ok_or("Reference reconstruction requires REPRISE_UNTRUNC pointing to a built untrunc executable")?;
            // untrunc operates on private copies; it never receives the immutable upload.
            let damaged = dir.join("damaged.mp4");
            let good = dir.join("donor.mp4");
            copy_media(input, &damaged, &cancel)?;
            copy_media(donor, &good, &cancel)?;
            stage("repairing");
            let args = vec![
                good.to_string_lossy().into_owned(),
                damaged.to_string_lossy().into_owned(),
            ];
            let (ok, _, err) = self.run(exe, &args, dir, &cancel, "untrunc")?;
            working = dir.join("damaged.mp4_fixed.mp4");
            if !ok || !working.exists() {
                return Err(format!(
                    "Reference reconstruction failed: {}",
                    err.chars().take(1500).collect::<String>()
                ));
            }
            info = Some(self.probe(&working, dir, &cancel, "reconstructed-probe")?);
        } else {
            probe?;
            report["strategy"] = json!("remux");
        }
        let info = info.ok_or("No media metadata")?;
        report["inputStreams"] = info["streams"].clone();
        report["inputFormat"] = info["format"].clone();
        // Keep ISO BMFF for its data/timecode tracks; otherwise Matroska. Map all streams, never silently omit.
        let iso = info["format"]["format_name"]
            .as_str()
            .unwrap_or("")
            .contains("mov");
        let output = dir.join(if iso {
            "recovered.mov"
        } else {
            "recovered.mkv"
        });
        stage("repairing");
        let mut args = [
            "-nostdin",
            "-v",
            "warning",
            "-n",
            "-max_alloc",
            "268435456",
            "-protocol_whitelist",
            "file,pipe",
            "-format_whitelist",
            FORMATS,
            "-i",
        ]
        .into_iter()
        .map(String::from)
        .chain([working.to_string_lossy().into_owned()])
        .chain(
            [
                "-map",
                "0",
                "-map_metadata",
                "0",
                "-map_chapters",
                "0",
                "-c",
                "copy",
            ]
            .into_iter()
            .map(String::from),
        )
        .chain([output.to_string_lossy().into_owned()])
        .collect::<Vec<_>>();
        if info["format"]["format_name"] == "avi" {
            args.splice(0..0, ["-fflags".into(), "+genpts".into()]);
            report["warnings"].as_array_mut().unwrap().push(json!("Missing AVI presentation timestamps may be generated from decode timestamps. Review timing and synchronization."));
        }
        let (remux_ok, _, remux_errors) = self.run(&self.ffmpeg, &args, dir, &cancel, "remux")?;
        if !output.is_file() {
            return Err(format!("Remux did not produce output: {remux_errors}"));
        }
        stage("validating");
        let validated = self.probe(&output, dir, &cancel, "output-probe")?;
        if validated["streams"].as_array().map(Vec::len) != info["streams"].as_array().map(Vec::len)
        {
            return Err("Output stream count changed; refusing to silently strip tracks".into());
        }
        let mut errors = 0;
        let mut full = true;
        let mut any_decoded = false;
        let mut notes = Vec::new();
        for stream in validated["streams"].as_array().unwrap() {
            if !matches!(stream["codec_type"].as_str(), Some("audio" | "video")) {
                continue;
            }
            let index = stream["index"].as_u64().ok_or("Invalid stream index")?;
            let args = [
                "-nostdin",
                "-v",
                "error",
                "-max_alloc",
                "268435456",
                "-protocol_whitelist",
                "file,pipe",
                "-format_whitelist",
                FORMATS,
                "-i",
            ]
            .into_iter()
            .map(String::from)
            .chain([
                output.to_string_lossy().into_owned(),
                "-map".into(),
                format!("0:{index}"),
            ])
            .chain(
                ["-progress", "pipe:1", "-f", "null", "-"]
                    .into_iter()
                    .map(String::from),
            )
            .collect::<Vec<_>>();
            let (ok, progress, err) = self.run(
                &self.ffmpeg,
                &args,
                dir,
                &cancel,
                &format!("decode-{index}"),
            )?;
            let count = err.lines().filter(|l| !l.trim().is_empty()).count();
            let emitted = decoded_media(&progress, stream["codec_type"] == "video");
            any_decoded |= emitted;
            errors += count + usize::from((!ok || !emitted) && count == 0);
            full &= ok && count == 0 && emitted;
            notes.push(format!(
                "Stream {index}: {}",
                if ok && count == 0 && emitted {
                    "full decode succeeded"
                } else {
                    "decode errors recorded"
                }
            ));
            if count > 0 {
                notes.push(err.chars().take(2000).collect());
            }
        }
        if !remux_ok {
            notes.push("Remux exited unsuccessfully; output is partial.".into());
        }
        if !remux_errors.trim().is_empty() {
            report["warnings"]
                .as_array_mut()
                .unwrap()
                .push(json!(remux_errors.chars().take(3000).collect::<String>()));
        }
        report["streams"] = validated["streams"].clone();
        report["format"] = validated["format"].clone();
        report["duration"] = json!(validated["format"]["duration"]
            .as_str()
            .and_then(|x| x.parse::<f64>().ok()));
        report["validation"] = json!({"fullDecode":full,"decodedMediaObserved":any_decoded,"errorCount":errors,"notes":notes});
        if !any_decoded {
            return Err("No decoded media was verified. Encoded packets alone do not establish playable recovery.".into());
        }
        report["outputSha256"] = json!(sha(&output, &cancel)?);
        report["summary"] = json!(if full && remux_ok {
            "Output remuxed and every audio/video stream fully decoded. Completeness is unknown."
        } else {
            "A candidate contains some decoded media but has validation or remux errors. Review it carefully; playback and completeness are not established."
        });
        Ok((output, full && remux_ok))
    }
    pub fn versions(&self, dir: &Path, cancel: &AtomicBool) -> Value {
        let mut value = json!({});
        for (name, exe) in [("ffmpeg", &self.ffmpeg), ("ffprobe", &self.ffprobe)] {
            value[name] = json!(self
                .run(
                    exe,
                    &["-version".into()],
                    dir,
                    cancel,
                    &format!("version-{name}")
                )
                .ok()
                .and_then(|x| x.1.lines().next().map(String::from))
                .unwrap_or_else(|| "unavailable".into()));
        }
        value["untrunc"]=json!(self.untrunc.as_ref().map(|_|"External REPRISE_UNTRUNC executable; bundled build pin: 9d86ec9ef2ffed1bf8131abe80742c0574db52b6"));
        value
    }
}
fn check_donor(input: &Value, donor: &Value) -> Result<(), String> {
    let a = input["streams"].as_array().ok_or("Missing streams")?;
    let b = donor["streams"].as_array().ok_or("Missing donor streams")?;
    if a.len() != b.len() {
        return Err("Reference stream count is incompatible".into());
    }
    for (a, b) in a.iter().zip(b) {
        for key in [
            "codec_type",
            "codec_name",
            "width",
            "height",
            "sample_rate",
            "channels",
            "r_frame_rate",
        ] {
            if !a[key].is_null() && !b[key].is_null() && a[key] != b[key] {
                return Err(format!("Reference {key} is incompatible"));
            }
        }
    }
    Ok(())
}

fn copy_media(source: &Path, target: &Path, cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::SeqCst) {
        return Err("cancelled".into());
    }
    let mut input = File::open(source).map_err(|e| e.to_string())?;
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .map_err(|e| e.to_string())?;
    let mut buffer = [0u8; 65536];
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err("cancelled".into());
        }
        let size = input.read(&mut buffer).map_err(|e| e.to_string())?;
        if size == 0 {
            break;
        }
        output
            .write_all(&buffer[..size])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[cfg(test)]
mod resource_tests {
    use super::*;
    #[test]
    fn cancelled_hash_and_copy_stop_before_io() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("input");
        fs::write(&source, b"audio").unwrap();
        let cancel = AtomicBool::new(true);
        assert_eq!(sha(&source, &cancel).unwrap_err(), "cancelled");
        assert_eq!(
            copy_media(&source, &temp.path().join("copy"), &cancel).unwrap_err(),
            "cancelled"
        );
    }
}

fn decoded_media(progress: &str, video: bool) -> bool {
    let key = if video { "frame=" } else { "out_time_us=" };
    progress
        .lines()
        .filter_map(|line| line.strip_prefix(key))
        .filter_map(|value| value.trim().parse::<i64>().ok())
        .any(|value| value > 0)
}
#[cfg(test)]
mod decode_evidence_tests {
    use super::*;
    #[test]
    fn empty_progress_is_not_media() {
        assert!(!decoded_media(
            "frame=0\nout_time_us=N/A\nprogress=end\n",
            true
        ));
        assert!(!decoded_media("out_time_us=0\nprogress=end\n", false));
        assert!(decoded_media("frame=72\nout_time_us=3000000\n", true));
        assert!(decoded_media("out_time_us=3000000\n", false));
    }
}
