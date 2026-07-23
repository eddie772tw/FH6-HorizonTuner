use byteorder::{ByteOrder, LittleEndian};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::net::UdpSocket;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase")]
pub struct TelemetryData {
    pub is_race_on: i32,
    pub timestamp_ms: u32,
    pub engine_max_rpm: f32,
    pub engine_idle_rpm: f32,
    pub current_engine_rpm: f32,
    pub acceleration_x: f32,
    pub acceleration_y: f32,
    pub acceleration_z: f32,
    pub velocity_x: f32,
    pub velocity_y: f32,
    pub velocity_z: f32,
    pub yaw: f32,
    pub pitch: f32,
    pub roll: f32,
    pub surface_rumble: Vec<f32>,
    pub tire_combined_slip: Vec<f32>,
    pub normalized_suspension_travel: Vec<f32>,
    pub tire_slip_ratio: Vec<f32>,
    pub tire_slip_angle: Vec<f32>,
    pub car_ordinal: i32,
    pub car_class: i32,
    pub car_performance_index: i32,
    pub drivetrain_type: i32,
    pub cylinders: i32,

    // V2 Dash Data Fields
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position_x: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position_y: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position_z: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed_meters_per_second: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub power_watts: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub torque_newtons: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tire_temp: Option<Vec<f32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boost: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fuel: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub best_lap: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_lap: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_lap: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distance_traveled: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_race_time: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lap_number: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub race_position: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accel_input: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brake_input: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clutch_input: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hand_brake_input: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gear: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub steer_input: Option<i8>,
}

pub fn parse_telemetry_packet(data: &[u8]) -> Option<TelemetryData> {
    if data.len() < 232 {
        return None;
    }

    let is_race_on = LittleEndian::read_i32(&data[0..4]);
    if is_race_on != 1 {
        return None;
    }

    let timestamp_ms = LittleEndian::read_u32(&data[4..8]);
    let engine_max_rpm = LittleEndian::read_f32(&data[8..12]);
    let engine_idle_rpm = LittleEndian::read_f32(&data[12..16]);
    let current_engine_rpm = LittleEndian::read_f32(&data[16..20]);

    let acceleration_x = LittleEndian::read_f32(&data[20..24]);
    let acceleration_y = LittleEndian::read_f32(&data[24..28]);
    let acceleration_z = LittleEndian::read_f32(&data[28..32]);

    let velocity_x = LittleEndian::read_f32(&data[32..36]);
    let velocity_y = LittleEndian::read_f32(&data[36..40]);
    let velocity_z = LittleEndian::read_f32(&data[40..44]);

    let yaw = LittleEndian::read_f32(&data[56..60]);
    let pitch = LittleEndian::read_f32(&data[60..64]);
    let roll = LittleEndian::read_f32(&data[64..68]);

    let normalized_suspension_travel = vec![
        LittleEndian::read_f32(&data[68..72]),
        LittleEndian::read_f32(&data[72..76]),
        LittleEndian::read_f32(&data[76..80]),
        LittleEndian::read_f32(&data[80..84]),
    ];

    let tire_slip_ratio = vec![
        LittleEndian::read_f32(&data[84..88]),
        LittleEndian::read_f32(&data[88..92]),
        LittleEndian::read_f32(&data[92..96]),
        LittleEndian::read_f32(&data[96..100]),
    ];

    let surface_rumble = vec![
        LittleEndian::read_f32(&data[148..152]),
        LittleEndian::read_f32(&data[152..156]),
        LittleEndian::read_f32(&data[156..160]),
        LittleEndian::read_f32(&data[160..164]),
    ];

    let tire_slip_angle = vec![
        LittleEndian::read_f32(&data[164..168]),
        LittleEndian::read_f32(&data[168..172]),
        LittleEndian::read_f32(&data[172..176]),
        LittleEndian::read_f32(&data[176..180]),
    ];

    let tire_combined_slip = vec![
        LittleEndian::read_f32(&data[180..184]),
        LittleEndian::read_f32(&data[184..188]),
        LittleEndian::read_f32(&data[188..192]),
        LittleEndian::read_f32(&data[192..196]),
    ];

    let car_ordinal = LittleEndian::read_i32(&data[212..216]);
    let car_class = LittleEndian::read_i32(&data[216..220]);
    let car_performance_index = LittleEndian::read_i32(&data[220..224]);
    let drivetrain_type = LittleEndian::read_i32(&data[224..228]);
    let cylinders = LittleEndian::read_i32(&data[228..232]);

    let mut telemetry = TelemetryData {
        is_race_on,
        timestamp_ms,
        engine_max_rpm,
        engine_idle_rpm,
        current_engine_rpm,
        acceleration_x,
        acceleration_y,
        acceleration_z,
        velocity_x,
        velocity_y,
        velocity_z,
        yaw,
        pitch,
        roll,
        surface_rumble,
        tire_combined_slip,
        normalized_suspension_travel,
        tire_slip_ratio,
        tire_slip_angle,
        car_ordinal,
        car_class,
        car_performance_index,
        drivetrain_type,
        cylinders,
        position_x: None,
        position_y: None,
        position_z: None,
        speed_meters_per_second: None,
        power_watts: None,
        torque_newtons: None,
        tire_temp: None,
        boost: None,
        fuel: None,
        best_lap: None,
        last_lap: None,
        current_lap: None,
        distance_traveled: None,
        current_race_time: None,
        lap_number: None,
        race_position: None,
        accel_input: None,
        brake_input: None,
        clutch_input: None,
        hand_brake_input: None,
        gear: None,
        steer_input: None,
    };

    if data.len() >= 324 {
        telemetry.position_x = Some(LittleEndian::read_f32(&data[244..248]));
        telemetry.position_y = Some(LittleEndian::read_f32(&data[248..252]));
        telemetry.position_z = Some(LittleEndian::read_f32(&data[252..256]));
        telemetry.speed_meters_per_second =
            Some(LittleEndian::read_f32(&data[256..260]));
        telemetry.power_watts = Some(LittleEndian::read_f32(&data[260..264]));
        telemetry.torque_newtons = Some(LittleEndian::read_f32(&data[264..268]));
        telemetry.tire_temp = Some(vec![
            LittleEndian::read_f32(&data[268..272]),
            LittleEndian::read_f32(&data[272..276]),
            LittleEndian::read_f32(&data[276..280]),
            LittleEndian::read_f32(&data[280..284]),
        ]);
        telemetry.boost = Some(LittleEndian::read_f32(&data[284..288]));
        telemetry.fuel = Some(LittleEndian::read_f32(&data[288..292]));
        telemetry.distance_traveled = Some(LittleEndian::read_f32(&data[292..296]));
        telemetry.best_lap = Some(LittleEndian::read_f32(&data[296..300]));
        telemetry.last_lap = Some(LittleEndian::read_f32(&data[300..304]));
        telemetry.current_lap = Some(LittleEndian::read_f32(&data[304..308]));
        telemetry.current_race_time = Some(LittleEndian::read_f32(&data[308..312]));
        telemetry.lap_number = Some(LittleEndian::read_u16(&data[312..314]));
        telemetry.race_position = Some(data[314]);
        telemetry.accel_input = Some(data[315]);
        telemetry.brake_input = Some(data[316]);
        telemetry.clutch_input = Some(data[317]);
        telemetry.hand_brake_input = Some(data[318]);
        telemetry.gear = Some(data[319]);
        telemetry.steer_input = Some(data[320] as i8);
    }

    Some(telemetry)
}

pub fn spawn_telemetry_listener(app_handle: AppHandle, port: u16) {
    let running = Arc::new(AtomicBool::new(true));

    tauri::async_runtime::spawn(async move {
        let addr = format!("0.0.0.0:{}", port);
        let socket = match UdpSocket::bind(&addr).await {
            Ok(s) => {
                println!("[Rust Telemetry] Listening on UDP {}", addr);
                s
            }
            Err(e) => {
                eprintln!("[Rust Telemetry] Failed to bind UDP {}: {}", addr, e);
                return;
            }
        };

        let mut buf = [0u8; 1024];

        while running.load(Ordering::Relaxed) {
            match socket.recv_from(&mut buf).await {
                Ok((len, _src)) => {
                    if let Some(telemetry) = parse_telemetry_packet(&buf[..len]) {
                        let _ = app_handle.emit("telemetry-data", telemetry);
                    }
                }
                Err(e) => {
                    eprintln!("[Rust Telemetry] UDP receive error: {}", e);
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_invalid_packet_length() {
        let buf = [0u8; 100];
        assert_eq!(parse_telemetry_packet(&buf), None);
    }

    #[test]
    fn test_parse_valid_v1_packet() {
        let mut buf = vec![0u8; 232];
        // Set is_race_on = 1
        LittleEndian::write_i32(&mut buf[0..4], 1);
        // Set timestamp_ms = 1000
        LittleEndian::write_u32(&mut buf[4..8], 1000);
        // Set engine_max_rpm = 7000.0
        LittleEndian::write_f32(&mut buf[8..12], 7000.0);
        // Set car_ordinal = 55
        LittleEndian::write_i32(&mut buf[212..216], 55);

        let parsed = parse_telemetry_packet(&buf).unwrap();
        assert_eq!(parsed.is_race_on, 1);
        assert_eq!(parsed.timestamp_ms, 1000);
        assert_eq!(parsed.engine_max_rpm, 7000.0);
        assert_eq!(parsed.car_ordinal, 55);
        assert_eq!(parsed.speed_meters_per_second, None);
    }

    #[test]
    fn test_parse_valid_v2_packet() {
        let mut buf = vec![0u8; 324];
        LittleEndian::write_i32(&mut buf[0..4], 1);
        LittleEndian::write_f32(&mut buf[256..260], 45.5); // speed 45.5 m/s
        buf[319] = 4; // Gear 4

        let parsed = parse_telemetry_packet(&buf).unwrap();
        assert_eq!(parsed.speed_meters_per_second, Some(45.5));
        assert_eq!(parsed.gear, Some(4));
    }
}
