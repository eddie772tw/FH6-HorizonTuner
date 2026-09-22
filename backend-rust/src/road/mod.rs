//! Road workflow domain.  The wire representation intentionally remains JSON
//! so the Rust side can be proven against the Python API without lossy DTOs.
mod analysis;
mod comparison;
mod matching;
mod models;
mod service;
mod store;
mod tuning_capture;

pub use analysis::{summarize_laps, summarize_road_observations};
pub use comparison::compare_road_runs;
pub use matching::local_comparison;
pub use models::validate_request;
pub use service::RoadService;
pub use store::{RoadStore, ROAD_SCHEMA};
pub use tuning_capture::{capture_sample, export_road_capture};
