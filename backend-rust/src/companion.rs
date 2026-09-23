//! Companion APP service for HorizonTuner.
//!
//! Handles device pairing, QR payload generation, session management,
//! and HUD on-demand asset manifest computation.

use crate::error::{ApiError, ApiResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};

const PAIRING_TOKEN_TTL: Duration = Duration::from_secs(300); // 5 minutes

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QrPayload {
    pub token: String,
    pub lan_ips: Vec<String>,
    pub port: u16,
    pub expires_in_secs: u64,
    pub expires_at_unix: i64,
    pub host_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PairedDevice {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub paired_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_connected_at: Option<String>,
    #[serde(skip_serializing, default)]
    pub session_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanionStatus {
    pub active_connections: usize,
    pub paired_devices_count: usize,
    pub lan_ips: Vec<String>,
    pub port: u16,
    pub lan_port: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HudManifestItem {
    pub path: String,
    pub sha256: String,
    pub size_bytes: u64,
}

pub struct CompanionService {
    root: PathBuf,
    default_port: Mutex<u16>,
    lan_port: Mutex<Option<u16>>,
    pending_tokens: Mutex<HashMap<String, Instant>>,
    paired_devices: Mutex<Vec<PairedDevice>>,
    active_connections: AtomicUsize,
}

impl CompanionService {
    pub fn new(root: &Path, default_port: u16) -> Self {
        let storage_path = root.join("companion_devices.json");
        let paired_devices = if storage_path.exists() {
            fs::read_to_string(&storage_path)
                .ok()
                .and_then(|content| serde_json::from_str(&content).ok())
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        Self {
            root: root.to_path_buf(),
            default_port: Mutex::new(default_port),
            lan_port: Mutex::new(None),
            pending_tokens: Mutex::new(HashMap::new()),
            paired_devices: Mutex::new(paired_devices),
            active_connections: AtomicUsize::new(0),
        }
    }

    pub fn set_port(&self, port: u16) {
        if let Ok(mut p) = self.default_port.lock() {
            *p = port;
        }
    }

    pub fn get_port(&self) -> u16 {
        self.default_port.lock().map(|p| *p).unwrap_or(8001)
    }

    pub fn set_lan_port(&self, port: Option<u16>) {
        if let Ok(mut current) = self.lan_port.lock() {
            *current = port;
        }
    }

    pub fn get_lan_port(&self) -> Option<u16> {
        self.lan_port.lock().map(|p| *p).unwrap_or(None)
    }

    /// Detect non-loopback IPv4 addresses across network interfaces.
    pub fn detect_lan_ips() -> Vec<String> {
        let mut ips = Vec::new();
        if let Ok(interfaces) = if_addrs::get_if_addrs() {
            for iface in interfaces {
                if !iface.is_loopback() {
                    if let if_addrs::IfAddr::V4(v4) = iface.addr {
                        let ip = v4.ip.to_string();
                        if !ips.contains(&ip) {
                            ips.push(ip);
                        }
                    }
                }
            }
        }
        ips
    }

    /// Generate a 5-minute one-time pairing token and build the QR payload.
    pub fn generate_qr_payload(&self, port: Option<u16>) -> QrPayload {
        let port = port
            .or_else(|| self.get_lan_port())
            .unwrap_or_else(|| self.get_port());
        let now = Instant::now();

        // 40 random bits give a code that is practical to enter on a phone.
        // Keep the code one-time and replace any accidental collision.
        let token = if let Ok(mut tokens) = self.pending_tokens.lock() {
            tokens.retain(|_, created_at| now.duration_since(*created_at) < PAIRING_TOKEN_TTL);
            loop {
                let candidate = uuid::Uuid::new_v4().simple().to_string()[..10].to_uppercase();
                if !tokens.contains_key(&candidate) {
                    tokens.insert(candidate.clone(), now);
                    break candidate;
                }
            }
        } else {
            String::new()
        };

        let lan_ips = Self::detect_lan_ips();
        let host_name = hostname_fallback();

        QrPayload {
            token,
            lan_ips,
            port,
            expires_in_secs: PAIRING_TOKEN_TTL.as_secs(),
            expires_at_unix: chrono::Utc::now().timestamp() + PAIRING_TOKEN_TTL.as_secs() as i64,
            host_name,
        }
    }

    /// Pair a device using an active pairing token.
    pub fn pair(
        &self,
        token: &str,
        device_name: &str,
        device_id: &str,
    ) -> ApiResult<(PairedDevice, String)> {
        // Validate token
        let is_valid = if let Ok(mut tokens) = self.pending_tokens.lock() {
            let now = Instant::now();
            tokens.retain(|_, created_at| now.duration_since(*created_at) < PAIRING_TOKEN_TTL);
            tokens.remove(token).is_some()
        } else {
            false
        };

        if !is_valid {
            return Err(ApiError::new(
                400,
                "Invalid or expired pairing token. Please scan the QR code again.",
            ));
        }

        let session_token = uuid::Uuid::new_v4().to_string();
        let now_str = chrono::Utc::now().to_rfc3339();

        let device = PairedDevice {
            id: if device_id.is_empty() {
                uuid::Uuid::new_v4().to_string()
            } else {
                device_id.to_string()
            },
            name: if device_name.is_empty() {
                "Android Device".into()
            } else {
                device_name.to_string()
            },
            platform: "Android".into(),
            paired_at: now_str.clone(),
            last_connected_at: Some(now_str),
            session_token: hash_session(&session_token),
        };

        if let Ok(mut devices) = self.paired_devices.lock() {
            // Remove existing device with same id if any
            devices.retain(|d| d.id != device.id);
            devices.push(device.clone());
            self.persist_devices(&devices);
        }

        Ok((device, session_token))
    }

    /// List all paired devices.
    pub fn list_devices(&self) -> Vec<PairedDevice> {
        self.paired_devices
            .lock()
            .map(|d| d.clone())
            .unwrap_or_default()
    }

    /// Remove / unpair a device by ID.
    pub fn remove_device(&self, device_id: &str) -> bool {
        if let Ok(mut devices) = self.paired_devices.lock() {
            let initial_len = devices.len();
            devices.retain(|d| d.id != device_id);
            if devices.len() < initial_len {
                self.persist_devices(&devices);
                return true;
            }
        }
        false
    }

    /// Validate a session token.
    pub fn validate_session(&self, session_token: &str) -> bool {
        if session_token.is_empty() {
            return false;
        }
        let token_hash = hash_session(session_token);
        if let Ok(mut devices) = self.paired_devices.lock() {
            if let Some(device) = devices.iter_mut().find(|d| d.session_token == token_hash) {
                device.last_connected_at = Some(chrono::Utc::now().to_rfc3339());
                return true;
            }
        }
        false
    }

    pub fn client_connected(&self) {
        self.active_connections.fetch_add(1, Ordering::SeqCst);
    }

    pub fn client_disconnected(&self) {
        self.active_connections.fetch_sub(1, Ordering::SeqCst);
    }

    pub fn get_status(&self, port: Option<u16>) -> CompanionStatus {
        let port = port.unwrap_or_else(|| self.get_port());
        let active = self.active_connections.load(Ordering::SeqCst);
        let count = self
            .paired_devices
            .lock()
            .map(|d| d.len())
            .unwrap_or_default();
        let lan_ips = Self::detect_lan_ips();

        CompanionStatus {
            active_connections: active,
            paired_devices_count: count,
            lan_ips,
            port,
            lan_port: self.get_lan_port(),
        }
    }

    /// Scan `hud_overlay/` or provided root to compute SHA-256 for all HUD assets.
    pub fn generate_hud_manifest(&self) -> Vec<HudManifestItem> {
        let mut manifest = Vec::new();
        // Check potential HUD directories: <root>/hud_overlay or current dir
        let candidates = [
            self.root.join("hud_overlay"),
            self.root.join("../hud_overlay"),
            PathBuf::from("hud_overlay"),
        ];

        for hud_dir in &candidates {
            if hud_dir.is_dir() {
                collect_assets_recursively(hud_dir, hud_dir, &mut manifest);
                break;
            }
        }

        manifest
    }

    fn persist_devices(&self, devices: &[PairedDevice]) {
        let storage_path = self.root.join("companion_devices.json");
        let stored: Vec<serde_json::Value> = devices
            .iter()
            .filter_map(|device| {
                let mut value = serde_json::to_value(device).ok()?;
                value["session_token"] = serde_json::Value::String(device.session_token.clone());
                Some(value)
            })
            .collect();
        if let Ok(json) = serde_json::to_string_pretty(&stored) {
            let _ = fs::write(storage_path, json);
        }
    }
}

fn hash_session(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn hostname_fallback() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "HorizonTuner-Host".into())
}

fn collect_assets_recursively(base: &Path, current: &Path, manifest: &mut Vec<HudManifestItem>) {
    let Ok(entries) = fs::read_dir(current) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if path
                .file_name()
                .is_some_and(|name| name != "tests" && name != "node_modules")
            {
                collect_assets_recursively(base, &path, manifest);
            }
        } else if path.is_file() {
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(content) = fs::read(&path) {
                    let mut hasher = Sha256::new();
                    hasher.update(&content);
                    let hash = hasher
                        .finalize()
                        .iter()
                        .map(|b| format!("{:02x}", b))
                        .collect::<String>();
                    let rel_path = path
                        .strip_prefix(base)
                        .map(|p| p.to_string_lossy().replace('\\', "/"))
                        .unwrap_or_else(|_| path.to_string_lossy().replace('\\', "/"));

                    manifest.push(HudManifestItem {
                        path: rel_path,
                        sha256: hash,
                        size_bytes: metadata.len(),
                    });
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qr_payload_generation_and_pairing() {
        let temp_dir = tempfile::tempdir().unwrap();
        let service = CompanionService::new(temp_dir.path(), 8001);

        let qr = service.generate_qr_payload(Some(8001));
        assert!(!qr.token.is_empty());
        assert_eq!(qr.port, 8001);
        assert!(!qr.lan_ips.is_empty());
        assert!(qr.expires_at_unix > chrono::Utc::now().timestamp());

        // Pair with the valid token
        let (device, session_token) = service
            .pair(&qr.token, "Test Tablet", "device-123")
            .expect("Pairing should succeed");
        assert_eq!(device.name, "Test Tablet");
        assert_eq!(device.id, "device-123");
        assert_eq!(device.platform, "Android");
        assert!(!session_token.is_empty());

        // Token should be one-time (cannot be reused)
        assert!(service.pair(&qr.token, "Another", "dev-2").is_err());

        // Session validation
        assert!(service.validate_session(&session_token));
        assert!(!service.validate_session("invalid-session-token"));
        let stored = fs::read_to_string(temp_dir.path().join("companion_devices.json")).unwrap();
        assert!(!stored.contains(&session_token));
        assert!(stored.contains(&hash_session(&session_token)));

        let restarted = CompanionService::new(temp_dir.path(), 8001);
        assert!(restarted.validate_session(&session_token));

        // Device listing
        let devices = service.list_devices();
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].id, "device-123");

        // Status
        let status = service.get_status(Some(8001));
        assert_eq!(status.paired_devices_count, 1);

        // Remove device
        assert!(service.remove_device("device-123"));
        assert_eq!(service.list_devices().len(), 0);
        assert!(!service.remove_device("device-123"));
        assert!(!CompanionService::new(temp_dir.path(), 8001).validate_session(&session_token));
    }
}
