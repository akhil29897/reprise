//! Restores MP4 timing that reference reconstruction drops: B-frame composition offsets (`ctts`) and edit lists.
//!
//! untrunc copies the healthy reference's `ctts` only when that pattern repeats. With adaptive B-frames it
//! writes presentation time = decode time, so frames are presented out of order. The decoder still knows the
//! true order: each decoded frame carries the timestamp of its own packet, which for such a file is
//! `decode_index * sample_duration`. We turn that permutation back into a `ctts` table.
//!
//! untrunc also writes no edit lists, so B-frame reorder delay and AAC encoder priming shift tracks against
//! each other. A recording from the same camera and mode uses the same delays, so the reference's edits apply.
use std::{
    fs::File,
    io::{self, Read, Seek, SeekFrom, Write},
    path::Path,
};

struct TopBox {
    kind: [u8; 4],
    start: u64,
    size: u64,
}

fn be32(b: &[u8], at: usize) -> Result<u32, String> {
    b.get(at..at + 4)
        .map(|s| u32::from_be_bytes(s.try_into().unwrap()))
        .ok_or_else(|| "Truncated MP4 box".to_string())
}

fn be64(b: &[u8], at: usize) -> Result<u64, String> {
    b.get(at..at + 8)
        .map(|s| u64::from_be_bytes(s.try_into().unwrap()))
        .ok_or_else(|| "Truncated MP4 box".to_string())
}

fn top_level(file: &mut File) -> Result<Vec<TopBox>, String> {
    let len = file.metadata().map_err(|e| e.to_string())?.len();
    let (mut off, mut boxes) = (0u64, Vec::new());
    while off + 8 <= len {
        let mut h = [0u8; 16];
        file.seek(SeekFrom::Start(off)).map_err(|e| e.to_string())?;
        file.read_exact(&mut h[..8]).map_err(|e| e.to_string())?;
        let mut size = u32::from_be_bytes(h[..4].try_into().unwrap()) as u64;
        if size == 1 {
            file.read_exact(&mut h[8..]).map_err(|e| e.to_string())?;
            size = u64::from_be_bytes(h[8..].try_into().unwrap());
        } else if size == 0 {
            size = len - off;
        }
        if size < 8 || off + size > len {
            break;
        }
        boxes.push(TopBox { kind: h[4..8].try_into().unwrap(), start: off, size });
        off += size;
    }
    Ok(boxes)
}

/// Child boxes of a box payload: (kind, payload bytes).
fn children(payload: &[u8]) -> Result<Vec<([u8; 4], &[u8])>, String> {
    let (mut off, mut out) = (0usize, Vec::new());
    while off + 8 <= payload.len() {
        let mut size = be32(payload, off)? as usize;
        let mut header = 8;
        if size == 1 {
            size = be64(payload, off + 8)? as usize;
            header = 16;
        } else if size == 0 {
            size = payload.len() - off;
        }
        if size < header || off + size > payload.len() {
            return Err("Malformed MP4 box tree".into());
        }
        out.push((payload[off + 4..off + 8].try_into().unwrap(), &payload[off + header..off + size]));
        off += size;
    }
    Ok(out)
}

fn find<'a>(payload: &'a [u8], kind: &[u8; 4]) -> Result<Option<&'a [u8]>, String> {
    Ok(children(payload)?.into_iter().find(|c| &c.0 == kind).map(|c| c.1))
}

fn make_box(kind: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(payload.len() + 16);
    if payload.len() + 8 <= u32::MAX as usize {
        out.extend(((payload.len() + 8) as u32).to_be_bytes());
        out.extend(kind);
    } else {
        out.extend(1u32.to_be_bytes());
        out.extend(kind);
        out.extend(((payload.len() + 16) as u64).to_be_bytes());
    }
    out.extend(payload);
    out
}

/// Reads the moov payload of an MP4 file.
fn read_moov(file: &mut File) -> Result<(TopBox, usize, Vec<u8>), String> {
    let moov = top_level(file)?.into_iter().find(|b| &b.kind == b"moov").ok_or("Missing moov")?;
    if moov.size > 256 * 1024 * 1024 {
        return Err("Index too large to rewrite".into());
    }
    let mut raw = vec![0u8; moov.size as usize];
    file.seek(SeekFrom::Start(moov.start)).map_err(|e| e.to_string())?;
    file.read_exact(&mut raw).map_err(|e| e.to_string())?;
    let header = if be32(&raw, 0)? == 1 { 16 } else { 8 };
    Ok((moov, header, raw))
}

/// (timescale, duration) from an mvhd or mdhd payload.
fn time_header(payload: &[u8]) -> Result<(u64, u64), String> {
    if payload.first() == Some(&1) {
        Ok((be32(payload, 20)? as u64, be64(payload, 24)?))
    } else {
        Ok((be32(payload, 12)? as u64, be32(payload, 16)? as u64))
    }
}

struct Track<'a> {
    trak: &'a [u8],
    handler: [u8; 4],
    timescale: u64,
    duration: u64,
    stbl: &'a [u8],
}

fn tracks(moov: &[u8]) -> Result<Vec<Track<'_>>, String> {
    let mut out = Vec::new();
    for (kind, trak) in children(moov)? {
        if &kind != b"trak" {
            continue;
        }
        let mdia = find(trak, b"mdia")?.ok_or("Missing mdia")?;
        let handler = find(mdia, b"hdlr")?
            .and_then(|h| h.get(8..12))
            .map(|h| h.try_into().unwrap())
            .unwrap_or(*b"    ");
        let (timescale, duration) = time_header(find(mdia, b"mdhd")?.ok_or("Missing mdhd")?)?;
        let stbl = find(mdia, b"minf")?.and_then(|m| find(m, b"stbl").ok().flatten()).ok_or("Missing stbl")?;
        out.push(Track { trak, handler, timescale, duration, stbl });
    }
    Ok(out)
}

/// Start offset (media time) of the first non-empty edit, if the track has a simple edit list.
fn first_media_time(trak: &[u8]) -> Result<Option<u64>, String> {
    let Some(elst) = find(trak, b"edts")?.map(|e| find(e, b"elst")).transpose()?.flatten() else { return Ok(None) };
    let entries = be32(elst, 4)?;
    if entries == 0 {
        return Ok(None);
    }
    let media_time = if elst[0] == 1 { be64(elst, 16)? as i64 } else { be32(elst, 12)? as i32 as i64 };
    // An empty first edit (media_time -1) delays the whole track; leave such layouts alone.
    Ok(u64::try_from(media_time).ok())
}

/// Offsets (in sample-duration units) that put each decoded sample at its display slot.
/// `frame_indices` lists, in presentation order, the decode index of every frame the decoder produced.
/// Returns None when no reordering is needed or the evidence is inconsistent.
pub fn composition_offsets(frame_indices: &[u64], samples: u64) -> Option<(Vec<u64>, u64)> {
    let mut display = vec![u64::MAX; samples as usize];
    for (slot, &decode) in frame_indices.iter().enumerate() {
        let entry = display.get_mut(decode as usize)?;
        if *entry != u64::MAX {
            return None; // the same packet decoded twice: timestamps are not a clean permutation
        }
        *entry = slot as u64;
    }
    // Undecodable samples keep their decode position.
    for (decode, entry) in display.iter_mut().enumerate() {
        if *entry == u64::MAX {
            *entry = decode as u64;
        }
    }
    if display.iter().enumerate().all(|(d, &s)| d as u64 == s) {
        return None;
    }
    let shift = display
        .iter()
        .enumerate()
        .map(|(d, &s)| (d as u64).saturating_sub(s))
        .max()
        .unwrap_or(0);
    Some((display.iter().enumerate().map(|(d, &s)| s + shift - d as u64).collect(), shift))
}

/// Builds a `ctts` box from frame order, returning it with the reorder delay in media units.
fn ctts_from_frames(track: &Track, frame_pts: &[i64]) -> Result<Option<(Vec<u8>, u64)>, String> {
    let stts = find(track.stbl, b"stts")?.ok_or("Missing stts")?;
    if be32(stts, 4)? != 1 {
        return Ok(None); // variable frame durations: decode index cannot be derived from time
    }
    let (samples, duration) = (be32(stts, 8)? as u64, be32(stts, 12)? as u64);
    // Too few decoded frames means the order evidence is incomplete.
    if duration == 0 || (frame_pts.len() as u64) * 100 < samples * 95 {
        return Ok(None);
    }
    let mut indices = Vec::with_capacity(frame_pts.len());
    for &pts in frame_pts {
        if pts < 0 || pts as u64 % duration != 0 {
            return Ok(None);
        }
        indices.push(pts as u64 / duration);
    }
    let Some((offsets, shift)) = composition_offsets(&indices, samples) else { return Ok(None) };
    let mut runs: Vec<(u32, u64)> = Vec::new();
    for offset in offsets {
        match runs.last_mut() {
            Some((count, value)) if *value == offset => *count += 1,
            _ => runs.push((1, offset)),
        }
    }
    let mut ctts = vec![0u8; 4];
    ctts.extend((runs.len() as u32).to_be_bytes());
    for (count, value) in runs {
        let scaled = u32::try_from(value * duration).map_err(|_| "Composition offset overflow")?;
        ctts.extend(count.to_be_bytes());
        ctts.extend(scaled.to_be_bytes());
    }
    Ok(Some((make_box(b"ctts", &ctts), shift * duration)))
}

fn edts(media_time: u64, track: &Track, movie_timescale: u64) -> Result<Vec<u8>, String> {
    let visible = track.duration.saturating_sub(media_time);
    let segment = (visible as u128 * movie_timescale as u128 / track.timescale.max(1) as u128) as u64;
    let mut elst = Vec::new();
    if segment > u32::MAX as u64 || media_time > i32::MAX as u64 {
        elst.extend([1, 0, 0, 0]);
        elst.extend(1u32.to_be_bytes());
        elst.extend(segment.to_be_bytes());
        elst.extend(i64::try_from(media_time).map_err(|_| "Edit offset overflow")?.to_be_bytes());
    } else {
        elst.extend([0, 0, 0, 0]);
        elst.extend(1u32.to_be_bytes());
        elst.extend((segment as u32).to_be_bytes());
        elst.extend((media_time as i32).to_be_bytes());
    }
    elst.extend([0, 1, 0, 0]); // media rate 1.0
    Ok(make_box(b"edts", &make_box(b"elst", &elst)))
}

#[derive(Default)]
struct TrackChange {
    ctts: Option<Vec<u8>>,
    edts: Option<Vec<u8>>,
}

/// What changed, for the report.
#[derive(Default, Debug, PartialEq)]
pub struct Restored {
    pub display_order: bool,
    pub edit_lists: usize,
}

fn plan(moov: &[u8], frame_pts: &[i64], reference_moov: Option<&[u8]>) -> Result<(Vec<TrackChange>, Restored), String> {
    let (movie_timescale, _) = time_header(find(moov, b"mvhd")?.ok_or("Missing mvhd")?)?;
    let output_tracks = tracks(moov)?;
    let reference_tracks = reference_moov.map(tracks).transpose()?.unwrap_or_default();
    let mut changes = Vec::new();
    let mut restored = Restored::default();
    let mut seen: Vec<[u8; 4]> = Vec::new();
    let mut video_done = false;
    for track in &output_tracks {
        let mut change = TrackChange::default();
        // Match the Nth track of a handler type with the reference's Nth track of that type.
        let nth = seen.iter().filter(|h| **h == track.handler).count();
        seen.push(track.handler);
        let reference = reference_tracks.iter().filter(|r| r.handler == track.handler).nth(nth);
        let has_edits = find(track.trak, b"edts")?.is_some();
        let mut media_time = None;
        if &track.handler == b"vide" && !video_done && find(track.stbl, b"ctts")?.is_none() {
            video_done = true;
            if let Some((ctts, delay)) = ctts_from_frames(track, frame_pts)? {
                change.ctts = Some(ctts);
                restored.display_order = true;
                media_time = Some(delay);
            }
        }
        if media_time.is_none() {
            media_time = match reference {
                Some(r) if r.timescale == track.timescale => first_media_time(r.trak)?,
                _ => None,
            };
        }
        if !has_edits {
            if let Some(time) = media_time.filter(|t| *t > 0) {
                change.edts = Some(edts(time, track, movie_timescale)?);
                restored.edit_lists += 1;
            }
        }
        changes.push(change);
    }
    Ok((changes, restored))
}

/// Rebuilds a box, inserting planned boxes and moving chunk offsets that point past the old moov.
fn rebuild(
    kind: &[u8; 4],
    payload: &[u8],
    change: Option<&TrackChange>,
    changes: &[TrackChange],
    moov_end: u64,
    delta: u64,
) -> Result<Vec<u8>, String> {
    match kind {
        b"moov" | b"trak" | b"mdia" | b"minf" | b"stbl" => {
            let mut body = Vec::with_capacity(payload.len() + delta as usize);
            let mut trak_index = 0;
            for (child, child_payload) in children(payload)? {
                let child_change = if &child == b"trak" {
                    trak_index += 1;
                    changes.get(trak_index - 1)
                } else {
                    change
                };
                body.extend(rebuild(&child, child_payload, child_change, changes, moov_end, delta)?);
                match (kind, &child, change) {
                    (b"trak", b"tkhd", Some(TrackChange { edts: Some(e), .. })) => body.extend(e),
                    (b"stbl", b"stts", Some(TrackChange { ctts: Some(c), .. })) => body.extend(c),
                    _ => {}
                }
            }
            Ok(make_box(kind, &body))
        }
        b"stco" | b"co64" => {
            let wide = kind == b"co64";
            let count = be32(payload, 4)? as usize;
            let width = if wide { 8 } else { 4 };
            let mut body = payload[..8].to_vec();
            for i in 0..count {
                let at = 8 + i * width;
                let offset = if wide { be64(payload, at)? } else { be32(payload, at)? as u64 };
                let moved = if offset >= moov_end { offset + delta } else { offset };
                if wide {
                    body.extend(moved.to_be_bytes());
                } else {
                    body.extend(u32::try_from(moved).map_err(|_| "Chunk offset overflow")?.to_be_bytes());
                }
            }
            Ok(make_box(kind, &body))
        }
        _ => Ok(make_box(kind, payload)),
    }
}

/// Writes `output` with restored timing. Returns what changed; writes nothing when no change applies.
pub fn restore(input: &Path, output: &Path, frame_pts: &[i64], reference: Option<&Path>) -> Result<Restored, String> {
    let mut file = File::open(input).map_err(|e| e.to_string())?;
    let (moov, header, raw) = read_moov(&mut file)?;
    let reference_moov = match reference {
        Some(path) => {
            let (_, h, bytes) = read_moov(&mut File::open(path).map_err(|e| e.to_string())?)?;
            Some(bytes[h..].to_vec())
        }
        None => None,
    };
    let (changes, restored) = plan(&raw[header..], frame_pts, reference_moov.as_deref())?;
    if restored == Restored::default() {
        return Ok(restored);
    }
    let delta = changes
        .iter()
        .map(|c| c.ctts.as_ref().map_or(0, Vec::len) + c.edts.as_ref().map_or(0, Vec::len))
        .sum::<usize>() as u64;
    let moov_end = moov.start + moov.size;
    let rebuilt = rebuild(b"moov", &raw[header..], None, &changes, moov_end, delta)?;
    // Chunk offsets were moved by `delta`; any other size change would misalign them.
    if rebuilt.len() as u64 != moov.size + delta {
        return Err("Rebuilt index size mismatch".into());
    }
    let mut out = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output)
        .map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    io::copy(&mut (&mut file).take(moov.start), &mut out).map_err(|e| e.to_string())?;
    out.write_all(&rebuilt).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(moov_end)).map_err(|e| e.to_string())?;
    io::copy(&mut file, &mut out).map_err(|e| e.to_string())?;
    out.flush().map_err(|e| e.to_string())?;
    Ok(restored)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offsets_follow_decoder_order() {
        // Decode order I P B B, presented as I B B P.
        let (offsets, shift) = composition_offsets(&[0, 2, 3, 1], 4).unwrap();
        assert_eq!(shift, 1);
        assert_eq!(offsets, vec![1, 3, 0, 0]); // display slot + shift - decode index
        assert!(composition_offsets(&[0, 1, 2], 3).is_none());
        assert!(composition_offsets(&[0, 0, 1], 3).is_none());
        assert!(composition_offsets(&[0, 9], 2).is_none());
    }

    fn time_box(kind: &[u8; 4], timescale: u32, duration: u32) -> Vec<u8> {
        make_box(kind, &[[0u8; 12].as_slice(), &timescale.to_be_bytes(), &duration.to_be_bytes(), &[0u8; 80]].concat())
    }

    fn trak(handler: &[u8; 4], media_timescale: u32, samples: u32, sample_duration: u32, elst_media_time: Option<i32>) -> Vec<u8> {
        let mut hdlr = vec![0u8; 8];
        hdlr.extend(handler);
        hdlr.extend([0u8; 13]);
        let stts = [0u32, 1, samples, sample_duration].iter().flat_map(|v| v.to_be_bytes()).collect::<Vec<_>>();
        let stco = [0u32, 1, 0].iter().flat_map(|v| v.to_be_bytes()).collect::<Vec<_>>();
        let stbl = make_box(b"stbl", &[make_box(b"stts", &stts), make_box(b"stco", &stco)].concat());
        let mdhd = time_box(b"mdhd", media_timescale, samples * sample_duration);
        let mdia = make_box(b"mdia", &[mdhd, make_box(b"hdlr", &hdlr), make_box(b"minf", &stbl)].concat());
        let edts = elst_media_time.map(|t| {
            let elst = [0u32, 1, 2400, t as u32, 0x0001_0000].iter().flat_map(|v| v.to_be_bytes()).collect::<Vec<_>>();
            make_box(b"edts", &make_box(b"elst", &elst))
        });
        make_box(b"trak", &[make_box(b"tkhd", &[0u8; 84]), edts.unwrap_or_default(), mdia].concat())
    }

    /// ftyp, moov (video + audio), mdat; stco entries point at the mdat payload.
    fn file(dir: &Path, name: &str, edits: bool) -> std::path::PathBuf {
        let traks = [
            trak(b"vide", 600, 4, 600, edits.then_some(600)),
            trak(b"soun", 48000, 2, 96000, edits.then_some(1024)),
        ]
        .concat();
        let ftyp = make_box(b"ftyp", b"isom\0\0\0\0");
        let mut moov = make_box(b"moov", &[time_box(b"mvhd", 600, 2400), traks].concat());
        let data_offset = (ftyp.len() + moov.len() + 8) as u32;
        let mut at = 0;
        while let Some(pos) = moov[at..].windows(4).position(|w| w == b"stco") {
            let offset_at = at + pos + 12;
            moov[offset_at..offset_at + 4].copy_from_slice(&data_offset.to_be_bytes());
            at = offset_at;
        }
        let path = dir.join(name);
        std::fs::write(&path, [ftyp, moov, make_box(b"mdat", b"FRAMEDATA")].concat()).unwrap();
        path
    }

    #[test]
    fn restores_display_order_and_reference_edits() {
        let temp = tempfile::tempdir().unwrap();
        let input = file(temp.path(), "in.mp4", false);
        let reference = file(temp.path(), "ref.mp4", true);
        let output = temp.path().join("out.mp4");
        let restored = restore(&input, &output, &[0, 1200, 1800, 600], Some(&reference)).unwrap();
        assert_eq!(restored, Restored { display_order: true, edit_lists: 2 });
        let bytes = std::fs::read(&output).unwrap();
        let ctts = bytes.windows(4).position(|w| w == b"ctts").unwrap();
        assert_eq!(be32(&bytes, ctts + 8).unwrap(), 3); // runs: (1,600) (1,1800) (2,0)
        let (_, h, moov) = read_moov(&mut File::open(&output).unwrap()).unwrap();
        let tracks = tracks(&moov[h..]).unwrap();
        assert_eq!(first_media_time(tracks[0].trak).unwrap(), Some(600)); // computed reorder delay
        assert_eq!(first_media_time(tracks[1].trak).unwrap(), Some(1024)); // audio priming from reference
        for stco in bytes.windows(4).enumerate().filter(|(_, w)| *w == b"stco").map(|(i, _)| i) {
            let chunk = be32(&bytes, stco + 12).unwrap() as usize;
            assert_eq!(&bytes[chunk..chunk + 9], b"FRAMEDATA");
        }
    }

    #[test]
    fn leaves_complete_files_untouched() {
        let temp = tempfile::tempdir().unwrap();
        let input = file(temp.path(), "in.mp4", true);
        let output = temp.path().join("out.mp4");
        assert_eq!(restore(&input, &output, &[0, 600, 1200, 1800], None).unwrap(), Restored::default());
        assert!(!output.exists());
    }
}
