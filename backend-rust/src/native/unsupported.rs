//! Inert adapters keep the API boundary usable without linking HUD services.
use super::NativeError;
use serde_json::{json, Value};

pub mod audio {
    use super::*;
    pub struct AudioService;
    impl AudioService {
        pub fn new() -> Self {
            Self
        }
        pub fn get_devices(&self) -> Value {
            json!([])
        }
        pub fn set_device(&self, _id: &str) -> Result<Value, NativeError> {
            Err(NativeError::Native("unsupported".into()))
        }
        pub fn spectrum(&self) -> Value {
            json!({"state":"unsupported"})
        }
        pub fn update_pcm(&self, _samples: &[f32]) {}
        pub fn stop_capture(&self) {}
    }
}

pub mod media {
    use super::*;
    pub struct MediaService;
    impl MediaService {
        pub fn new() -> Self {
            Self
        }
        pub fn snapshot(&self) -> Value {
            json!({"state":"unsupported","has_media":false})
        }
        pub fn refresh(&self) {}
        pub fn thumbnail(&self) -> Option<(String, Vec<u8>)> {
            None
        }
        pub fn thumbnail_metadata(&self) -> Option<(String, Vec<u8>, String)> {
            None
        }
    }
}
