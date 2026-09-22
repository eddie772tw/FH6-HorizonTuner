use serde_json::{Map, Value};

#[derive(Clone, Debug, PartialEq)]
pub enum DragRecorderStatus {
    Idle,
    Waiting,
    Recording,
    Finished,
}
impl DragRecorderStatus {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Waiting => "waiting",
            Self::Recording => "recording",
            Self::Finished => "finished",
        }
    }
}
#[derive(Clone, Debug)]
pub struct DragRecorder {
    status: DragRecorderStatus,
    session: Vec<Value>,
    first_timestamp: Option<f64>,
    low_throttle: Option<f64>,
    pub low_throttle_duration_limit: f64,
    pub max_recording_time: f64,
    result: Value,
    car_id: i64,
    car_name: String,
    car_params: Map<String, Value>,
    car_database: Map<String, Value>,
}
impl Default for DragRecorder {
    fn default() -> Self {
        Self {
            status: DragRecorderStatus::Idle,
            session: vec![],
            first_timestamp: None,
            low_throttle: None,
            low_throttle_duration_limit: 0.8,
            max_recording_time: 30.0,
            result: Value::Object(Map::new()),
            car_id: 0,
            car_name: String::new(),
            car_params: Map::new(),
            car_database: Map::new(),
        }
    }
}
impl DragRecorder {
    /// Supply the same in-memory car profile/database used by the Python
    /// endpoint. Context is retained across `prepare` and `clear`.
    pub fn set_context(&mut self, params: &Value, car_database: &Value) {
        self.car_params = params.as_object().cloned().unwrap_or_default();
        self.car_database = car_database.as_object().cloned().unwrap_or_default();
    }
    pub fn prepare(&mut self) {
        self.reset(DragRecorderStatus::Waiting)
    }
    pub fn clear(&mut self) {
        self.reset(DragRecorderStatus::Idle)
    }
    fn reset(&mut self, status: DragRecorderStatus) {
        self.status = status;
        self.session.clear();
        self.first_timestamp = None;
        self.low_throttle = None;
        self.result = Value::Object(Map::new());
        self.car_id = 0;
        self.car_name.clear();
    }
    pub fn status(&self) -> Value {
        Value::from(self.status.as_str())
    }
    pub fn data(&self) -> Value {
        Value::Array(self.session.clone())
    }
    pub fn analysis(&self) -> Value {
        self.result.clone()
    }
    pub fn record(&mut self, data: &Value) {
        if matches!(
            self.status,
            DragRecorderStatus::Idle | DragRecorderStatus::Finished
        ) {
            return;
        }
        let Some(d) = data.as_object() else { return };
        let speed = f(d, "SpeedMetersPerSecond", 0.0);
        let accel = i(d, "AccelInput", 0);
        let gear = i(d, "Gear", 0);
        let ts = f(d, "TimestampMS", 0.0);
        let race = i(d, "IsRaceOn", 0);
        if self.status == DragRecorderStatus::Waiting {
            if speed < 0.5 && gear >= 1 && accel >= 220 {
                self.status = DragRecorderStatus::Recording;
                self.first_timestamp = Some(ts);
                self.car_id = i(d, "CarOrdinal", 0);
                self.car_name = self
                    .car_database
                    .get(&self.car_id.to_string())
                    .and_then(Value::as_object)
                    .and_then(|v| v.get("display_name"))
                    .and_then(Value::as_str)
                    .map(str::to_owned)
                    .unwrap_or_else(|| format!("Car {}", self.car_id));
            } else {
                return;
            }
        }
        if self.status != DragRecorderStatus::Recording {
            return;
        }
        let rel = (ts - self.first_timestamp.unwrap_or(ts)) / 1000.0;
        let point = point(d, rel, speed, gear, accel);
        self.session.push(point);
        let mut stop = None;
        if race != 1 {
            stop = Some("Race paused/ended")
        } else if rel > self.max_recording_time {
            stop = Some("Max recording time reached")
        } else if accel < 150 {
            if self.low_throttle.is_none() {
                self.low_throttle = Some(ts)
            } else if ts - self.low_throttle.unwrap() > self.low_throttle_duration_limit * 1000.0 {
                stop = Some("Throttle released")
            }
        } else {
            self.low_throttle = None
        }
        if stop.is_none() && rel > 3.0 && speed < 0.1 {
            stop = Some("Launch failed (stationary)")
        }
        if stop.is_some() {
            self.status = DragRecorderStatus::Finished;
            self.analyze();
        }
    }
    pub fn analyze(&mut self) {
        if self.session.is_empty() {
            self.result = serde_json::json!({"error":"No data recorded."});
            return;
        }
        let mut max_speed = -1.0;
        let mut max_idx = 0;
        for (i, p) in self.session.iter().enumerate() {
            let s = fv(p, "SpeedMetersPerSecond", 0.0);
            if s > max_speed {
                max_speed = s;
                max_idx = i
            }
        }
        if max_idx >= 10 {
            self.session.truncate(max_idx + 1)
        }
        let first: Vec<&Value> = self
            .session
            .iter()
            .filter(|p| iv(p, "Gear", 0) == 1)
            .collect();
        let avg_f = avg_slip(&first, 0, 1);
        let avg_r = avg_slip(&first, 2, 3);
        let drivetrain = if avg_r > 0.08 && avg_f < 0.03 {
            "RWD"
        } else if avg_f > 0.08 && avg_r < 0.03 {
            "FWD"
        } else {
            "AWD"
        };
        let launch = if drivetrain == "RWD" {
            avg_r
        } else if drivetrain == "FWD" {
            avg_f
        } else {
            (avg_f + avg_r) / 2.0
        };
        let mut shifts = Vec::new();
        let mut current = None;
        for idx in 0..self.session.len() {
            let g = iv(&self.session[idx], "Gear", 0);
            if g <= 0 {
                continue;
            }
            if current.is_none() {
                current = Some(g);
                continue;
            }
            if current != Some(g) {
                let start = idx.saturating_sub(8);
                let before = &self.session[start..idx];
                let n_before = before
                    .iter()
                    .map(|p| fv(p, "CurrentEngineRpm", 0.0))
                    .fold(0.0, f64::max);
                let end = (idx + 30).min(self.session.len());
                let post = &self.session[idx..end];
                let throttle: Vec<&Value> = post
                    .iter()
                    .filter(|p| iv(p, "AccelInput", 0) > 200)
                    .collect();
                let n_after = if throttle.is_empty() {
                    post.iter()
                        .map(|p| fv(p, "CurrentEngineRpm", 0.0))
                        .fold(f64::INFINITY, f64::min)
                } else {
                    throttle
                        .iter()
                        .map(|p| fv(p, "CurrentEngineRpm", 0.0))
                        .fold(f64::INFINITY, f64::min)
                };
                let t = if let Some(p) = throttle.first() {
                    fv(p, "time", 0.0) - fv(&self.session[idx], "time", 0.0)
                } else {
                    0.0
                };
                let retention = if n_before > 0.0 {
                    n_after / n_before
                } else {
                    0.0
                };
                shifts.push(serde_json::json!({"from_gear":current.unwrap(),"to_gear":g,"n_before":n_before.round(),"n_after":n_after.round(),"rpm_drop":(n_before-n_after).round(),"retention":(retention*1000.0).round()/1000.0,"shift_time":(t*1000.0).round()/1000.0}));
                current = Some(g)
            }
        }
        let mut shift_recommendations = Vec::<Value>::new();
        for (idx, current_shift) in shifts.iter().enumerate() {
            let retention = current_shift["retention"].as_f64().unwrap_or(0.0);
            let from = current_shift["from_gear"].as_i64().unwrap_or(0);
            let to = current_shift["to_gear"].as_i64().unwrap_or(0);
            if idx > 0 {
                let previous = &shifts[idx - 1];
                let previous_retention = previous["retention"].as_f64().unwrap_or(0.0);
                if retention < previous_retention - 0.02 {
                    shift_recommendations.push(Value::from(format!(
                        "{} 檔升 {} 檔的轉速保留率（{:.1}%）低於 {} 檔升 {} 檔（{:.1}%）。這說明 {} 檔齒比相對於前一檔過疏，換檔後轉速掉得太深。建議將 {} 檔齒比調大（往 Acceleration 方向，數值調高 5%~8%）。",
                        from, to, retention * 100.0, previous["from_gear"], previous["to_gear"], previous_retention * 100.0, to, to
                    )));
                } else if retention > 0.93 {
                    shift_recommendations.push(Value::from(format!(
                        "{} 檔升 {} 檔的齒比過密（轉速保留率高達 {:.1}%）。這會導致頻繁換檔且無法充分拉長加速時間，建議將 {} 檔齒比調小（往 Speed 方向，數值調低 5%）。",
                        from, to, retention * 100.0, to
                    )));
                }
            } else if retention < 0.62 {
                shift_recommendations.push(Value::from(format!(
                    "1 檔升 2 檔的轉速掉落過多（保留率僅 {:.1}%）。建議將 2 檔齒比調大（往 Acceleration 方向，數值調高）以減小轉速落差，避免引擎掉出動力帶。",
                    retention * 100.0
                )));
            }
        }
        let last = self.session.last().unwrap();
        let max_gear = self
            .session
            .iter()
            .map(|p| iv(p, "Gear", 0))
            .max()
            .unwrap_or(0);
        let top: Vec<&Value> = self
            .session
            .iter()
            .filter(|p| iv(p, "Gear", 0) == max_gear)
            .collect();
        let top_rpm = top
            .iter()
            .map(|p| fv(p, "CurrentEngineRpm", 0.0))
            .fold(0.0, f64::max);
        let engine_max = fv(last, "EngineMaxRpm", 8000.0);
        let final_recommendation = if top_rpm >= engine_max - 150.0 {
            format!("車輛在最高檔位（{} 檔）達到了轉速紅線（{:.0} RPM）。這限制了您的最高時速，建議將終傳比（Final Drive）調小（往 Speed 方向，數值降低 5%~10%）以釋放更高的極速潛力。", max_gear, top_rpm)
        } else if top_rpm < engine_max * 0.72 && fv(last, "SpeedMetersPerSecond", 0.0) > 0.0 {
            let end_time = fv(last, "time", 0.0);
            let recent: Vec<&Value> = self
                .session
                .iter()
                .filter(|p| fv(p, "time", 0.0) > end_time - 1.0)
                .collect();
            let avg_accel = if recent.len() > 1 {
                let dv = fv(recent.last().unwrap(), "SpeedMetersPerSecond", 0.0)
                    - fv(recent[0], "SpeedMetersPerSecond", 0.0);
                let dt = fv(recent.last().unwrap(), "time", 0.0) - fv(recent[0], "time", 0.0);
                if dt > 0.0 {
                    dv / dt
                } else {
                    0.0
                }
            } else {
                0.0
            };
            if avg_accel < 0.5 {
                format!("測試結束時，最高檔位（{} 檔）的最高轉速僅為 {:.0} RPM，且車輛已無明顯加速度。這說明終傳比過疏，引擎無法拉高轉速發揮馬力。建議將終傳比（Final Drive）調大（往 Acceleration 方向，數值提高 5%~10%）以提升加速響應。", max_gear, top_rpm)
            } else {
                "終傳比設定尚屬合理，最高檔位轉速與加速終點匹配良好。".to_string()
            }
        } else {
            "終傳比設定尚屬合理，最高檔位轉速與加速終點匹配良好。".to_string()
        };
        let (path_valid, max_dev, yaw) = path_stats(&self.session);
        let active: Vec<&Value> = self
            .session
            .iter()
            .filter(|p| iv(p, "Gear", 0) >= 1 && iv(p, "AccelInput", 0) > 200)
            .collect();
        let diff = slip_diff(&active, drivetrain);
        let mut diagnostics = Vec::new();
        if active.is_empty() {
            diagnostics.push(Value::from("無足夠的加速區間數據進行穩定性分析。"));
        } else {
            if diff > 0.08 {
                diagnostics.push(Value::from(format!("偵測到驅動輪左右打滑嚴重失衡（平均滑移差值 {:.1}%）。這通常是由於【差速器加速鎖定率 (Acceleration Lock)】過低所引發的單邊打滑（動力流失至空轉輪）。建議將差速器加速鎖定率調高 10%~20%，以確保兩側驅動輪獲得均衡扭力，維持加速軌跡穩定。", diff * 100.0)));
            } else if yaw > 0.08 && diff > 0.03 {
                let mut left_leads = 0;
                let mut right_leads = 0;
                for p in &active {
                    let x = p.get("TireSlipRatio").and_then(Value::as_array);
                    let q = |n| {
                        x.and_then(|z| z.get(n))
                            .and_then(Value::as_f64)
                            .unwrap_or(0.0)
                    };
                    let (l, r) = if drivetrain == "RWD" {
                        (q(2), q(3))
                    } else if drivetrain == "FWD" {
                        (q(0), q(1))
                    } else {
                        ((q(0) + q(2)) / 2.0, (q(1) + q(3)) / 2.0)
                    };
                    if l > r + 0.02 {
                        left_leads += 1;
                    } else if r > l + 0.02 {
                        right_leads += 1;
                    }
                }
                let total = left_leads + right_leads;
                if total > 10
                    && (left_leads as f64 / total as f64) > 0.25
                    && (right_leads as f64 / total as f64) > 0.25
                {
                    diagnostics.push(Value::from(format!("偵測到車尾在加速過程中出現左右搖擺（蛇行，Fish-tailing，偏航角波動達 {:.1}°）。這通常是由於【差速器加速鎖定率 (Acceleration Lock)】過高，限制了左右輪必要轉速差而產生強烈側向力矩。建議將差速器加速鎖定率降低 10%~15%，以提升行車穩定性。", yaw.to_degrees())));
                }
            }
            if diagnostics.is_empty() {
                if diff < 0.03 && yaw < 0.04 {
                    diagnostics.push(Value::from(
                        "直行穩定性優異，左右動力分配非常均衡，加速時車身無明顯偏擺。",
                    ));
                } else {
                    diagnostics.push(Value::from("直行穩定性良好。加速過程中車身動態對稱。"));
                }
            }
            if diff > 0.04 {
                diagnostics.push(Value::from("環境提示：請確保測試直路完全乾燥且平整。如果單側輪胎壓到草地、沙地或路邊，會因為物理路面摩擦力不均而造成嚴重的左右打滑失衡。"));
            }
        }
        let launch_recommendation = if launch > 0.18 {
            format!("起步時驅動輪打滑過度（平均滑移率 {:.1}%）。這會浪費抓地力，建議將 1 檔齒比調小（往 Speed 方向，數值調低 5%~10%）或調小終傳比，以降低輪胎端的瞬間起步扭力。", launch * 100.0)
        } else if launch < 0.05 {
            format!("起步時幾乎沒有打滑（平均滑移率 {:.1}%）。若起步拉轉速度較慢，說明抓地力未被充分利用，建議將 1 檔齒比調大（往 Acceleration 方向，數值調高 5%~10%）以獲得更強的起步推力。", launch * 100.0)
        } else {
            format!("起步滑移率表現優異（平均滑移率 {:.1}%），輪胎剛好處於最佳縱向抓地力區間（10%~15%）。請保持目前的 1 檔與終傳比設定。", launch * 100.0)
        };
        self.result = serde_json::json!({"car_id":self.car_id.to_string(),"car_name":self.car_name,"drivetrain":drivetrain,"max_gear":max_gear,"max_speed_kmh":(max_speed*3.6*10.0).round()/10.0,"duration":(fv(last,"time",0.0)*100.0).round()/100.0,"launch_slip_percent":(launch*1000.0).round()/10.0,"launch_recommendation":launch_recommendation,"shifts":shifts,"shift_recommendations":shift_recommendations,"final_drive_recommendation":final_recommendation,"path_valid":path_valid,"max_deviation_meters":(max_dev*100.0).round()/100.0,"yaw_variance_rad":(yaw*10000.0).round()/10000.0,"stability_diagnostics":diagnostics});
    }
}
fn f(m: &Map<String, Value>, k: &str, d: f64) -> f64 {
    m.get(k).and_then(Value::as_f64).unwrap_or(d)
}
fn i(m: &Map<String, Value>, k: &str, d: i64) -> i64 {
    m.get(k)
        .and_then(Value::as_i64)
        .or_else(|| m.get(k).and_then(Value::as_f64).map(|x| x as i64))
        .unwrap_or(d)
}
fn fv(v: &Value, k: &str, d: f64) -> f64 {
    v.as_object().map(|m| f(m, k, d)).unwrap_or(d)
}
fn iv(v: &Value, k: &str, d: i64) -> i64 {
    v.as_object().map(|m| i(m, k, d)).unwrap_or(d)
}
fn point(d: &Map<String, Value>, time: f64, speed: f64, gear: i64, accel: i64) -> Value {
    serde_json::json!({"time":(time*1000.0).round()/1000.0,"SpeedMetersPerSecond":speed,"CurrentEngineRpm":f(d,"CurrentEngineRpm",0.0),"Gear":gear,"AccelInput":accel,"BrakeInput":i(d,"BrakeInput",0),"TorqueNewtons":f(d,"TorqueNewtons",0.0),"PowerWatts":f(d,"PowerWatts",0.0),"TireSlipRatio":d.get("TireSlipRatio").and_then(Value::as_array).cloned().unwrap_or_else(||vec![Value::from(0.0);4]),"EngineMaxRpm":f(d,"EngineMaxRpm",8000.0),"EngineIdleRpm":f(d,"EngineIdleRpm",1000.0),"PositionX":f(d,"PositionX",0.0),"PositionZ":f(d,"PositionZ",0.0),"Yaw":f(d,"Yaw",0.0)})
}
fn avg_slip(points: &[&Value], a: usize, b: usize) -> f64 {
    if points.is_empty() {
        return 0.0;
    }
    points
        .iter()
        .map(|p| {
            let x = p.get("TireSlipRatio").and_then(Value::as_array);
            (x.and_then(|z| z.get(a))
                .and_then(Value::as_f64)
                .unwrap_or(0.0)
                .abs()
                + x.and_then(|z| z.get(b))
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0)
                    .abs())
                / 2.0
        })
        .sum::<f64>()
        / points.len() as f64
}
fn slip_diff(points: &[&Value], drive: &str) -> f64 {
    if points.is_empty() {
        return 0.0;
    }
    points
        .iter()
        .map(|p| {
            let x = p.get("TireSlipRatio").and_then(Value::as_array);
            let q = |n| {
                x.and_then(|z| z.get(n))
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0)
            };
            if drive == "RWD" {
                (q(2) - q(3)).abs()
            } else if drive == "FWD" {
                (q(0) - q(1)).abs()
            } else {
                ((q(0) - q(1)).abs() + (q(2) - q(3)).abs()) / 2.0
            }
        })
        .sum::<f64>()
        / points.len() as f64
}
fn path_stats(points: &[Value]) -> (bool, f64, f64) {
    if points.is_empty() {
        return (true, 0.0, 0.0);
    }
    let n = points.len();
    let xs: Vec<f64> = points.iter().map(|p| fv(p, "PositionX", 0.0)).collect();
    let zs: Vec<f64> = points.iter().map(|p| fv(p, "PositionZ", 0.0)).collect();
    let ys: Vec<f64> = points.iter().map(|p| fv(p, "Yaw", 0.0)).collect();
    let mx = xs.iter().sum::<f64>() / n as f64;
    let mz = zs.iter().sum::<f64>() / n as f64;
    let num = xs
        .iter()
        .zip(zs.iter())
        .map(|(x, z)| (x - mx) * (z - mz))
        .sum::<f64>();
    let den = xs.iter().map(|x| (x - mx).powi(2)).sum::<f64>();
    let dev = if den == 0.0 {
        xs.iter().map(|x| (x - mx).abs()).fold(0.0, f64::max)
    } else {
        let a = num / den;
        let b = mz - a * mx;
        xs.iter()
            .zip(zs.iter())
            .map(|(x, z)| (a * x - z + b).abs() / (a * a + 1.0).sqrt())
            .fold(0.0, f64::max)
    };
    let c = ys.iter().map(|y| y.cos()).sum::<f64>() / n as f64;
    let s = ys.iter().map(|y| y.sin()).sum::<f64>() / n as f64;
    let avg = s.atan2(c);
    let mut min = f64::INFINITY;
    let mut max = f64::NEG_INFINITY;
    for y in ys {
        let d = (y - avg).sin().atan2((y - avg).cos());
        min = min.min(d);
        max = max.max(d)
    }
    (dev <= 3.0, dev, max - min)
}
