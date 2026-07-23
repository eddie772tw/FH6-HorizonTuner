use byteorder::{LittleEndian, ReadBytesExt};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::sync::Arc;
use tokio::net::UdpSocket;
use tokio::sync::broadcast;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryData {
    #[serde(rename = "IsRaceOn")]
    pub is_race_on: i32,
    #[serde(rename = "TimestampMS")]
    pub timestamp_ms: u32,
    #[serde(rename = "EngineMaxRpm")]
    pub engine_max_rpm: f32,
    #[serde(rename = "EngineIdleRpm")]
    pub engine_idle_rpm: f32,
    #[serde(rename = "CurrentEngineRpm")]
    pub current_engine_rpm: f32,
    #[serde(rename = "AccelerationX")]
    pub accel_x: f32,
    #[serde(rename = "AccelerationY")]
    pub accel_y: f32,
    #[serde(rename = "AccelerationZ")]
    pub accel_z: f32,
    #[serde(rename = "VelocityX")]
    pub vel_x: f32,
    #[serde(rename = "VelocityY")]
    pub vel_y: f32,
    #[serde(rename = "VelocityZ")]
    pub vel_z: f32,
    #[serde(rename = "Yaw")]
    pub yaw: f32,
    #[serde(rename = "Pitch")]
    pub pitch: f32,
    #[serde(rename = "Roll")]
    pub roll: f32,
    #[serde(rename = "SurfaceRumble")]
    pub surface_rumble: [f32; 4],
    #[serde(rename = "TireCombinedSlip")]
    pub tire_combined_slip: [f32; 4],
    #[serde(rename = "NormalizedSuspensionTravel")]
    pub normalized_suspension_travel: [f32; 4],
    #[serde(rename = "TireSlipRatio")]
    pub tire_slip_ratio: [f32; 4],
    #[serde(rename = "TireSlipAngle")]
    pub tire_slip_angle: [f32; 4],
    #[serde(rename = "CarOrdinal")]
    pub car_ordinal: i32,
    #[serde(rename = "CarClass")]
    pub car_class: i32,
    #[serde(rename = "CarPerformanceIndex")]
    pub car_pi: i32,
    #[serde(rename = "DrivetrainType")]
    pub drivetrain_type: i32,
    #[serde(rename = "Cylinders")]
    pub cylinders: i32,

    // V2 Dash Data (optional, but we include it if the packet is long enough)
    #[serde(rename = "PositionX")]
    pub pos_x: f32,
    #[serde(rename = "PositionY")]
    pub pos_y: f32,
    #[serde(rename = "PositionZ")]
    pub pos_z: f32,
    #[serde(rename = "SpeedMetersPerSecond")]
    pub speed: f32,
    #[serde(rename = "PowerWatts")]
    pub power: f32,
    #[serde(rename = "TorqueNewtons")]
    pub torque: f32,
    #[serde(rename = "TireTemp")]
    pub tire_temp: [f32; 4],
    #[serde(rename = "Boost")]
    pub boost: f32,
    #[serde(rename = "Fuel")]
    pub fuel: f32,
    #[serde(rename = "DistanceTraveled")]
    pub distance_traveled: f32,
    #[serde(rename = "BestLap")]
    pub best_lap: f32,
    #[serde(rename = "LastLap")]
    pub last_lap: f32,
    #[serde(rename = "CurrentLap")]
    pub current_lap: f32,
    #[serde(rename = "CurrentRaceTime")]
    pub current_race_time: f32,
    #[serde(rename = "LapNumber")]
    pub lap_number: u16,
    #[serde(rename = "RacePosition")]
    pub race_position: u8,
    #[serde(rename = "AccelInput")]
    pub accel_input: u8,
    #[serde(rename = "BrakeInput")]
    pub brake_input: u8,
    #[serde(rename = "ClutchInput")]
    pub clutch_input: u8,
    #[serde(rename = "HandBrakeInput")]
    pub handbrake_input: u8,
    #[serde(rename = "Gear")]
    pub gear: u8,
    #[serde(rename = "SteerInput")]
    pub steer_input: i8,
}

pub fn parse_telemetry_packet(data: &[u8]) -> Option<TelemetryData> {
    if data.len() < 232 {
        return None;
    }

    let mut cursor = Cursor::new(data);

    // 0: IsRaceOn (s32)
    let is_race_on = cursor.read_i32::<LittleEndian>().unwrap_or(0);
    if is_race_on != 1 {
        return None;
    }

    cursor.set_position(4);
    let timestamp_ms = cursor.read_u32::<LittleEndian>().unwrap_or(0);
    let engine_max_rpm = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let engine_idle_rpm = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let current_engine_rpm = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let accel_x = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let accel_y = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let accel_z = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let vel_x = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let vel_y = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let vel_z = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);

    cursor.set_position(56);
    let yaw = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let pitch = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let roll = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);

    cursor.set_position(68);
    let susp_fl = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let susp_fr = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let susp_rl = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let susp_rr = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);

    cursor.set_position(84);
    let slip_ratio_fl = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let slip_ratio_fr = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let slip_ratio_rl = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let slip_ratio_rr = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);

    cursor.set_position(148);
    let rumble_fl = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let rumble_fr = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let rumble_rl = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let rumble_rr = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);

    cursor.set_position(164);
    let slip_angle_fl = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let slip_angle_fr = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let slip_angle_rl = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let slip_angle_rr = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);

    cursor.set_position(180);
    let combined_slip_fl = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let combined_slip_fr = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let combined_slip_rl = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
    let combined_slip_rr = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);

    cursor.set_position(212);
    let car_ordinal = cursor.read_i32::<LittleEndian>().unwrap_or(0);
    let car_class = cursor.read_i32::<LittleEndian>().unwrap_or(0);
    let car_pi = cursor.read_i32::<LittleEndian>().unwrap_or(0);
    let drivetrain_type = cursor.read_i32::<LittleEndian>().unwrap_or(0);
    let cylinders = cursor.read_i32::<LittleEndian>().unwrap_or(0);

    let mut t = TelemetryData {
        is_race_on,
        timestamp_ms,
        engine_max_rpm,
        engine_idle_rpm,
        current_engine_rpm,
        accel_x,
        accel_y,
        accel_z,
        vel_x,
        vel_y,
        vel_z,
        yaw,
        pitch,
        roll,
        surface_rumble: [rumble_fl, rumble_fr, rumble_rl, rumble_rr],
        tire_combined_slip: [
            combined_slip_fl,
            combined_slip_fr,
            combined_slip_rl,
            combined_slip_rr,
        ],
        normalized_suspension_travel: [susp_fl, susp_fr, susp_rl, susp_rr],
        tire_slip_ratio: [slip_ratio_fl, slip_ratio_fr, slip_ratio_rl, slip_ratio_rr],
        tire_slip_angle: [slip_angle_fl, slip_angle_fr, slip_angle_rl, slip_angle_rr],
        car_ordinal,
        car_class,
        car_pi,
        drivetrain_type,
        cylinders,
        pos_x: 0.0,
        pos_y: 0.0,
        pos_z: 0.0,
        speed: 0.0,
        power: 0.0,
        torque: 0.0,
        tire_temp: [0.0; 4],
        boost: 0.0,
        fuel: 0.0,
        distance_traveled: 0.0,
        best_lap: 0.0,
        last_lap: 0.0,
        current_lap: 0.0,
        current_race_time: 0.0,
        lap_number: 0,
        race_position: 0,
        accel_input: 0,
        brake_input: 0,
        clutch_input: 0,
        handbrake_input: 0,
        gear: 0,
        steer_input: 0,
    };

    if data.len() >= 324 {
        cursor.set_position(244);
        t.pos_x = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
        t.pos_y = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
        t.pos_z = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);

        cursor.set_position(256);
        t.speed = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
        t.power = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
        t.torque = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);

        cursor.set_position(268);
        t.tire_temp[0] = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
        t.tire_temp[1] = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
        t.tire_temp[2] = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
        t.tire_temp[3] = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);

        cursor.set_position(284);
        t.boost = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
        t.fuel = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);

        cursor.set_position(292);
        t.distance_traveled = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);

        cursor.set_position(296);
        t.best_lap = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
        t.last_lap = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);
        t.current_lap = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);

        cursor.set_position(308);
        t.current_race_time = cursor.read_f32::<LittleEndian>().unwrap_or(0.0);

        cursor.set_position(312);
        t.lap_number = cursor.read_u16::<LittleEndian>().unwrap_or(0);
        t.race_position = cursor.read_u8().unwrap_or(0);
        t.accel_input = cursor.read_u8().unwrap_or(0);
        t.brake_input = cursor.read_u8().unwrap_or(0);
        t.clutch_input = cursor.read_u8().unwrap_or(0);
        t.handbrake_input = cursor.read_u8().unwrap_or(0);
        t.gear = cursor.read_u8().unwrap_or(0);
        t.steer_input = cursor.read_i8().unwrap_or(0);
    }

    Some(t)
}

pub fn pack_telemetry_binary(data: &TelemetryData) -> [u8; 128] {
    let mut buf = [0u8; 128];
    let mut cursor = std::io::Cursor::new(&mut buf[..]);
    use byteorder::WriteBytesExt;

    let is_race_on = data.is_race_on;
    let rpm = data.current_engine_rpm;
    let max_rpm = if data.engine_max_rpm == 0.0 {
        6000.0
    } else {
        data.engine_max_rpm
    };
    let idle_rpm = if data.engine_idle_rpm == 0.0 {
        1000.0
    } else {
        data.engine_idle_rpm
    };
    let speed = data.speed * 3.6;
    let gear = data.gear as i32;
    let power = data.power / 745.7;
    let boost = data.boost / 6894.75729;

    let accel_x = data.accel_x / 9.81;
    let accel_y = data.accel_y / 9.81;
    let accel_z = data.accel_z / 9.81;

    let yaw = data.yaw;
    let pitch = data.pitch;
    let roll = data.roll;

    let tire_temps = data.tire_temp;
    let susp_travels = data.normalized_suspension_travel;
    let slip_ratios = data.tire_slip_ratio;
    let slip_angles = data.tire_slip_angle;
    let slip_angles_deg = [
        slip_angles[0] * 57.29578,
        slip_angles[1] * 57.29578,
        slip_angles[2] * 57.29578,
        slip_angles[3] * 57.29578,
    ];

    let _ = cursor.write_i32::<LittleEndian>(is_race_on);
    let _ = cursor.write_f32::<LittleEndian>(rpm);
    let _ = cursor.write_f32::<LittleEndian>(max_rpm);
    let _ = cursor.write_f32::<LittleEndian>(idle_rpm);
    let _ = cursor.write_f32::<LittleEndian>(speed);
    let _ = cursor.write_i32::<LittleEndian>(gear);
    let _ = cursor.write_f32::<LittleEndian>(power);
    let _ = cursor.write_f32::<LittleEndian>(boost);
    let _ = cursor.write_f32::<LittleEndian>(accel_x);
    let _ = cursor.write_f32::<LittleEndian>(accel_y);
    let _ = cursor.write_f32::<LittleEndian>(accel_z);
    let _ = cursor.write_f32::<LittleEndian>(yaw);
    let _ = cursor.write_f32::<LittleEndian>(pitch);
    let _ = cursor.write_f32::<LittleEndian>(roll);

    for &t in &tire_temps {
        let _ = cursor.write_f32::<LittleEndian>(t);
    }
    for &s in &susp_travels {
        let _ = cursor.write_f32::<LittleEndian>(s);
    }
    for &sr in &slip_ratios {
        let _ = cursor.write_f32::<LittleEndian>(sr);
    }
    for &sa in &slip_angles_deg {
        let _ = cursor.write_f32::<LittleEndian>(sa);
    }

    buf
}

pub async fn start_udp_listener(ip: String, port: u16, sender: broadcast::Sender<TelemetryData>) {
    let addr = format!("{}:{}", ip, port);
    tracing::info!("Listening for Forza Telemetry on UDP {}", addr);

    // Create a socket to forward data to the Python worker
    let worker_socket = UdpSocket::bind("127.0.0.1:0")
        .await
        .ok()
        .map(|s| Arc::new(s));
    let worker_addr = "127.0.0.1:8002";

    match UdpSocket::bind(&addr).await {
        Ok(socket) => {
            let mut buf = vec![0u8; 1024];
            loop {
                match socket.recv_from(&mut buf).await {
                    Ok((len, _addr)) => {
                        let packet_data = &buf[..len];
                        if let Some(telemetry) = parse_telemetry_packet(packet_data) {
                            // Non-blocking send to Rust WebSockets
                            let _ = sender.send(telemetry);

                            // Forward raw packet to Python worker
                            if let Some(ref ws) = worker_socket {
                                let _ = ws.send_to(packet_data, worker_addr).await;
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!("Failed to receive UDP packet: {:?}", e);
                    }
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to bind UDP socket on {}: {:?}", addr, e);
        }
    }
}
