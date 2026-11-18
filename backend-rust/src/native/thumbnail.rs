pub(crate) fn validate_thumbnail(
    raw_content_type: Option<&str>,
    bytes: &[u8],
) -> Option<&'static str> {
    // Metadata is untrusted: require a raster signature even when a MIME type is supplied.
    let detected = match bytes {
        [0xFF, 0xD8, 0xFF, ..] => "image/jpeg",
        [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, ..] => "image/png",
        b if b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") => "image/gif",
        b if b.len() >= 12 && &b[..4] == b"RIFF" && &b[8..12] == b"WEBP" => "image/webp",
        [b'B', b'M', ..] => "image/bmp",
        [0x00, 0x00, 0x01, 0x00, ..] => "image/x-icon",
        b if b.len() >= 12 && &b[4..12] == b"ftypavif" => "image/avif",
        _ => return None,
    };
    if let Some(raw) = raw_content_type {
        if raw.chars().any(char::is_control) {
            return None;
        }
        if raw.trim().is_empty() {
            return Some(detected);
        }
        let declared = match raw.split(';').next()?.trim().to_ascii_lowercase().as_str() {
            "image/jpeg" | "image/jpg" => "image/jpeg",
            "image/png" => "image/png",
            "image/gif" => "image/gif",
            "image/webp" => "image/webp",
            "image/bmp" | "image/x-bmp" | "image/x-ms-bmp" => "image/bmp",
            "image/x-icon" | "image/vnd.microsoft.icon" => "image/x-icon",
            "image/avif" => "image/avif",
            _ => return None,
        };
        if declared != detected {
            return None;
        }
    }
    Some(detected)
}

#[cfg(test)]
mod tests {
    use super::validate_thumbnail;
    #[test]
    fn thumbnail_validation_requires_matching_raster_signature_for_declared_types() {
        let padded_svg = [b" ".repeat(64), b"<svg onload=alert(1)>".to_vec()].concat();
        assert_eq!(validate_thumbnail(Some("image/png"), &padded_svg), None);
        assert_eq!(validate_thumbnail(Some("image/png"), b"not-an-image"), None);
        assert_eq!(validate_thumbnail(Some("image/png"), b"\xFF\xD8\xFF"), None);
        assert_eq!(
            validate_thumbnail(Some("\r\nimage/png"), b"\x89PNG\r\n\x1a\n"),
            None
        );
        assert_eq!(validate_thumbnail(Some("image/png"), b""), None);
        for (mime, bytes) in [
            ("image/gif", b"GIF89a".as_slice()),
            ("image/bmp", b"BM".as_slice()),
            ("image/x-icon", b"\0\0\x01\0".as_slice()),
            ("image/avif", b"\0\0\0\x18ftypavif".as_slice()),
        ] {
            assert_eq!(validate_thumbnail(Some(mime), bytes), Some(mime));
            assert_eq!(validate_thumbnail(None, bytes), Some(mime));
        }
    }
}
