mod timing;
mod engine;
mod jobs;
mod security;
use serde_json::{json, Value};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};
use tiny_http::{Header, Request, Response, Server};
fn header(req: &Request, name: &str) -> String {
    req.headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|h| h.value.as_str().to_string())
        .unwrap_or_default()
}
fn respond(req: Request, status: u16, value: Value, origin: &str) {
    let mut response = Response::from_string(value.to_string())
        .with_status_code(status)
        .with_header(Header::from_bytes("Content-Type", "application/json").unwrap());
    for h in cors(origin) {
        response.add_header(h);
    }
    let _ = req.respond(response);
}
fn cors(origin: &str) -> Vec<Header> {
    let mut h = vec![
        Header::from_bytes("Cache-Control", "no-store").unwrap(),
        Header::from_bytes("X-Content-Type-Options", "nosniff").unwrap(),
    ];
    if !origin.is_empty() {
        for (k, v) in [
            ("Access-Control-Allow-Origin", origin),
            ("Vary", "Origin"),
            ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
            (
                "Access-Control-Allow-Headers",
                "Authorization, Content-Type, X-Filename",
            ),
            (
                "Access-Control-Expose-Headers",
                "Content-Disposition, Content-Length",
            ),
            ("Access-Control-Allow-Private-Network", "true"),
        ] {
            h.push(Header::from_bytes(k, v).unwrap());
        }
    }
    h
}
fn fail(req: Request, status: u16, error: &str, origin: &str) {
    respond(req, status, json!({"error":error}), origin)
}
fn handle(
    mut req: Request,
    store: Arc<jobs::Store>,
    token: &str,
    origins: &[String],
    max_upload: u64,
) {
    let origin = header(&req, "Origin");
    let host = header(&req, "Host");
    if !["127.0.0.1:47831", "localhost:47831"].contains(&host.as_str()) {
        return fail(req, 403, "Host is not allowed", "");
    }
    if !origin.is_empty() && !origins.contains(&origin) {
        return fail(req, 403, "Origin is not allowed", "");
    }
    if req.url().contains('?') {
        return fail(req, 400, "Query strings are not supported", &origin);
    }
    if req.method().as_str() == "OPTIONS" {
        let mut r = Response::empty(204);
        for h in cors(&origin) {
            r.add_header(h);
        }
        let _ = req.respond(r);
        return;
    }
    if !security::authorized(&header(&req, "Authorization"), token) {
        return fail(req, 401, "Bearer token required", &origin);
    }
    let path = req.url().to_string();
    let method = req.method().as_str().to_string();
    if path == "/v1/health" && method == "GET" {
        let e = &store.engine;
        return respond(
            req,
            200,
            json!({"version":env!("CARGO_PKG_VERSION"),"engines":{"ffmpeg":security::is_executable(&e.ffmpeg),"ffprobe":security::is_executable(&e.ffprobe),"untrunc":e.untrunc.as_ref().is_some_and(|p|security::is_executable(p))},"platform":std::env::consts::OS}),
            &origin,
        );
    }
    if path == "/v1/files" && method == "POST" {
        if req.body_length().is_some_and(|n| n as u64 > max_upload) {
            return fail(req, 413, "Upload exceeds configured limit", &origin);
        }
        let id = uuid::Uuid::new_v4().to_string();
        let name = security::safe_name(&header(&req, "X-Filename"));
        let dir = store.root.join("files").join(&id);
        let result = (|| -> Result<u64, String> {
            fs::create_dir(&dir).map_err(|e| e.to_string())?;
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(dir.join("input.partial"))
                .map_err(|e| e.to_string())?;
            let mut size = 0u64;
            let mut buf = [0u8; 65536];
            loop {
                let n = req.as_reader().read(&mut buf).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                size += n as u64;
                if size > max_upload {
                    return Err("Upload exceeds configured limit".into());
                }
                file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            }
            file.sync_all().map_err(|e| e.to_string())?;
            drop(file);
            fs::rename(dir.join("input.partial"), dir.join("input")).map_err(|e| e.to_string())?;
            fs::write(
                dir.join("file.json"),
                json!({"id":id,"name":name,"size":size}).to_string(),
            )
            .map_err(|e| e.to_string())?;
            Ok(size)
        })();
        return match result {
            Ok(size) => respond(req, 201, json!({"id":id,"name":name,"size":size}), &origin),
            Err(e) => {
                let _ = fs::remove_dir_all(dir);
                fail(
                    req,
                    if e.contains("limit") { 413 } else { 507 },
                    &e,
                    &origin,
                )
            }
        };
    }
    if path == "/v1/jobs" && method == "GET" {
        let mut all = store
            .jobs
            .lock()
            .unwrap()
            .values()
            .cloned()
            .collect::<Vec<_>>();
        all.sort_by(|a, b| b["createdAt"].as_str().cmp(&a["createdAt"].as_str()));
        return respond(req, 200, json!({"jobs":all}), &origin);
    }
    if path == "/v1/jobs" && method == "POST" {
        let mut raw = Vec::new();
        if req.as_reader().take(16385).read_to_end(&mut raw).is_err() || raw.len() > 16384 {
            return fail(req, 400, "Invalid or oversized JSON", &origin);
        }
        let body: Value = match serde_json::from_slice(&raw) {
            Ok(v) => v,
            Err(_) => return fail(req, 400, "Invalid JSON", &origin),
        };
        let strategy = body["strategy"].as_str().unwrap_or("");
        let fid = body["fileId"].as_str().unwrap_or("");
        let reference = body["referenceId"].as_str();
        if !["auto", "remux", "reference"].contains(&strategy)
            || !security::valid_id(fid)
            || reference.is_some_and(|r| !security::valid_id(r))
            || (strategy == "reference" && reference.is_none())
        {
            return fail(
                req,
                400,
                "Invalid file IDs, strategy, or missing reference",
                &origin,
            );
        }
        let meta = fs::read(store.root.join("files").join(fid).join("file.json"))
            .ok()
            .and_then(|s| serde_json::from_slice::<Value>(&s).ok());
        if meta.is_none()
            || reference
                .is_some_and(|id| !store.root.join("files").join(id).join("input").is_file())
        {
            return fail(req, 404, "Uploaded file not found", &origin);
        }
        let name = meta.as_ref().unwrap()["name"].as_str().unwrap_or("clip");
        return match store.create(fid, reference, strategy, name) {
            Ok(j) => respond(req, 202, j, &origin),
            Err(e) => fail(req, 503, &e, &origin),
        };
    }
    let parts = path.trim_start_matches('/').split('/').collect::<Vec<_>>();
    if parts.len() >= 3 && parts[0] == "v1" && parts[1] == "jobs" && security::valid_id(parts[2]) {
        let id = parts[2];
        let job = match store.get(id) {
            Some(j) => j,
            None => return fail(req, 404, "Job not found", &origin),
        };
        if parts.len() == 3 && method == "GET" {
            return respond(req, 200, job, &origin);
        }
        if parts.len() == 4 && parts[3] == "cancel" && method == "POST" {
            return match store.cancel(id) {
                Ok(j) => respond(req, 200, j, &origin),
                Err(e) => fail(req, 503, &e, &origin),
            };
        }
        if parts.len() == 4 && method == "GET" && ["output", "report"].contains(&parts[3]) {
            let report = parts[3] == "report";
            if !report && !matches!(job["status"].as_str(), Some("completed" | "partial")) {
                return fail(req, 409, "No validated output is available", &origin);
            }
            let name = if report {
                "report.json"
            } else {
                job["outputName"].as_str().unwrap_or("")
            };
            let file = match File::open(store.root.join("jobs").join(id).join(name)) {
                Ok(f) => f,
                Err(_) => return fail(req, 404, "Artifact not available", &origin),
            };
            let mut response = Response::from_file(file)
                .with_header(
                    Header::from_bytes(
                        "Content-Type",
                        if report {
                            "application/json"
                        } else {
                            "application/octet-stream"
                        },
                    )
                    .unwrap(),
                )
                .with_header(
                    Header::from_bytes(
                        "Content-Disposition",
                        format!("attachment; filename=\"{name}\""),
                    )
                    .unwrap(),
                );
            for h in cors(&origin) {
                response.add_header(h);
            }
            let _ = req.respond(response);
            return;
        }
    }
    fail(req, 404, "Route not found", &origin)
}
fn executable(name: &str) -> PathBuf {
    let env_name = format!("REPRISE_{}", name.to_uppercase());
    if let Some(p) = std::env::var_os(env_name) {
        return p.into();
    }
    if let Some(paths) = std::env::var_os("PATH") {
        for p in std::env::split_paths(&paths) {
            let f = p.join(if cfg!(windows) {
                format!("{name}.exe")
            } else {
                name.into()
            });
            if f.is_file() {
                return f;
            }
        }
    }
    PathBuf::from(format!("/opt/homebrew/bin/{name}"))
}
fn main() {
    if let Err(e) = start() {
        eprintln!("Reprise: {e}");
        std::process::exit(1)
    }
}
fn start() -> Result<(), String> {
    let mut root = if cfg!(target_os = "macos") {
        PathBuf::from(std::env::var_os("HOME").ok_or("HOME unavailable")?)
            .join("Library/Application Support/Reprise")
    } else if cfg!(windows) {
        PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA unavailable")?)
            .join("Reprise")
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".local/share")
            })
            .join("reprise")
    };
    let mut origins = security::DEV_ORIGINS
        .iter()
        .map(|s| s.to_string())
        .collect::<Vec<_>>();
    let mut max_upload = 64u64 * 1024 * 1024 * 1024;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--data-dir" => root = PathBuf::from(args.next().ok_or("Missing data directory")?),
            "--origin" => {
                let o = args.next().ok_or("Missing origin")?;
                if o == "*" || (!o.starts_with("https://") && !o.starts_with("http://")) {
                    return Err("Explicit HTTP(S) origin required".into());
                }
                origins.push(o)
            }
            "--max-upload" => {
                max_upload = args
                    .next()
                    .ok_or("Missing upload limit")?
                    .parse()
                    .map_err(|_| "Invalid upload limit")?
            }
            "--help" => {
                println!("reprise-companion [--data-dir PATH] [--origin ORIGIN] [--max-upload BYTES]\nPair using the startup token. Optional REPRISE_TOKEN, REPRISE_FFMPEG, REPRISE_FFPROBE, REPRISE_UNTRUNC environment variables.");
                return Ok(());
            }
            _ => return Err(format!("Unknown argument {arg}")),
        }
    }
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    root = fs::canonicalize(root).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    let token = std::env::var("REPRISE_TOKEN").unwrap_or_else(|_| {
        format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        )
    });
    if token.len() < 24 {
        return Err("REPRISE_TOKEN must be at least 24 characters".into());
    }
    let engine = engine::Engine {
        ffmpeg: executable("ffmpeg"),
        ffprobe: executable("ffprobe"),
        untrunc: std::env::var_os("REPRISE_UNTRUNC")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute() && security::is_executable(p)),
        max_output: max_upload,
        timeout: Duration::from_secs(3600),
    };
    let store = jobs::Store::new(root, engine)?;
    let server = Server::http("127.0.0.1:47831").map_err(|e| e.to_string())?;
    println!("Reprise companion listening on http://127.0.0.1:47831\nPairing token: {token}");
    let count = Arc::new(AtomicUsize::new(0));
    for req in server.incoming_requests() {
        if count.fetch_add(1, Ordering::SeqCst) >= 8 {
            count.fetch_sub(1, Ordering::SeqCst);
            fail(req, 503, "Too many concurrent requests", "");
            continue;
        }
        let (store, token, origins, count) =
            (store.clone(), token.clone(), origins.clone(), count.clone());
        std::thread::spawn(move || {
            handle(req, store, &token, &origins, max_upload);
            count.fetch_sub(1, Ordering::SeqCst);
        });
    }
    Ok(())
}
