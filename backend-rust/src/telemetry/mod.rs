//! Pure telemetry domain code and the serialized SQLite boundary.
//!
//! The UDP adapter should call [`parse_packet`] and enqueue the returned
//! value.  It must not call [`TelemetryStore`] directly from its receive loop.

mod contract;
mod drag;
mod dyno;
mod packet;
mod race;
mod sqlite;

pub use contract::decoded_point;
pub use drag::{DragRecorder, DragRecorderStatus};
pub use dyno::{
    collect_dyno_sample, compute_dyno_value, create_default_car_params, dyno_is_reasonable,
    reconcile_dyno_profile_segment, DynoQualityAssessment, DynoQualityGate,
    DynoQualityGateRegistry,
};
pub use packet::{
    pack_binary, parse_packet, FULL_TELEMETRY_PACKET_LENGTH, FULL_TELEMETRY_SCHEMA,
    LEGACY_TELEMETRY_PACKET_LENGTH, LEGACY_TELEMETRY_SCHEMA,
};
pub use race::{RaceRecorder, RaceRecorderConfig, RaceRecorderStatus, RecorderCommand};
pub use sqlite::TelemetryStore;
