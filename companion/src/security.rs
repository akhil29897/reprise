use std::path::Path;
pub const DEV_ORIGINS: &[&str] = &[
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "https://akhil29897.github.io",
];
pub fn valid_id(s: &str) -> bool {
    uuid::Uuid::parse_str(s)
        .map(|id| id.to_string() == s)
        .unwrap_or(false)
}
pub fn authorized(actual: &str, token: &str) -> bool {
    let expected = format!("Bearer {token}");
    actual.len() == expected.len()
        && actual
            .as_bytes()
            .iter()
            .zip(expected.as_bytes())
            .fold(0u8, |a, (b, c)| a | (b ^ c))
            == 0
}
pub fn safe_name(encoded: &str) -> String {
    let bytes = encoded.as_bytes();
    let mut result = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Some(v) = std::str::from_utf8(&bytes[i + 1..i + 3])
                .ok()
                .and_then(|s| u8::from_str_radix(s, 16).ok())
            {
                result.push(v);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i]);
        i += 1;
    }
    let name = String::from_utf8_lossy(&result)
        .replace(['\\', '/'], "_")
        .chars()
        .filter(|c| !c.is_control())
        .take(200)
        .collect::<String>();
    if name.trim().is_empty() {
        "upload.bin".into()
    } else {
        name
    }
}
pub fn is_executable(p: &Path) -> bool {
    p.is_file()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn names_are_display_only() {
        assert_eq!(safe_name("..%2Fclip%0A.mp4"), ".._clip.mp4");
    }
    #[test]
    fn no_paths_as_ids() {
        assert!(!valid_id("../../etc/passwd"));
        assert!(!valid_id("ABC"));
        assert!(valid_id(&uuid::Uuid::new_v4().to_string()));
    }
    #[test]
    fn bearer_required() {
        assert!(!authorized("token", "token"));
        assert!(authorized("Bearer token", "token"));
    }
}
#[cfg(test)]
mod malformed_name_tests {
    #[test]
    fn unicode_after_percent_does_not_panic() {
        assert_eq!(super::safe_name("%€"), "%€");
    }
}
