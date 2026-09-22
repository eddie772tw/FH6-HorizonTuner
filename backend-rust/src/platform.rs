//! Product capabilities describe compiled features, never inferred hardware.
use serde::Serialize;

pub const HUD_ENABLED: bool = cfg!(feature = "hud");

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub hud_overlay: bool,
    pub audio_spectrum: bool,
    pub system_media: bool,
    pub local_motec_launch: bool,
}

pub fn capabilities() -> Capabilities {
    Capabilities {
        hud_overlay: HUD_ENABLED,
        audio_spectrum: HUD_ENABLED && cfg!(windows),
        system_media: HUD_ENABLED && cfg!(windows),
        local_motec_launch: cfg!(windows),
    }
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryBinding {
    pub port: Option<u16>,
    pub listen_addresses: Vec<String>,
    pub error: Option<String>,
}

impl TelemetryBinding {
    pub fn from_addresses(addresses: Vec<std::net::SocketAddr>) -> Self {
        Self {
            port: addresses.first().map(|a| a.port()),
            listen_addresses: addresses.iter().map(|a| a.ip().to_string()).collect(),
            error: None,
        }
    }
}
