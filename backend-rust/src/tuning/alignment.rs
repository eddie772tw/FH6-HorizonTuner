//! Static alignment model migrated from the desktop v1.6.2 contract.
use super::{RaceGoal, RallyProfile, TuningCarParams};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Default)]
pub enum Season {
    #[default]
    Summer,
    Autumn,
    Winter,
    Spring,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Axle<T> {
    pub front: T,
    pub rear: T,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StaticAlignment {
    pub pc_f: f64,
    pub pc_r: f64,
    pub target_phot: f64,
    pub season_bias: f64,
    pub camber: Axle<f64>,
    pub toe: Axle<String>,
    pub caster: f64,
    pub hw_f: f64,
    pub hw_r: f64,
}
fn positive(v: Option<f64>, default: f64) -> f64 {
    v.filter(|v| v.is_finite() && *v > 0.0).unwrap_or(default)
}
fn nonzero(v: Option<f64>, default: f64) -> f64 {
    v.filter(|v| v.is_finite() && *v != 0.0).unwrap_or(default)
}
fn r1(v: f64) -> f64 {
    (v * 10.0 + 0.5).floor() / 10.0
}

// ECMAScript toFixed(1): round the exact binary value, without a rounded
// intermediate multiplication by ten; exact ties choose the larger magnitude.
fn fixed1(v: f64) -> f64 {
    let bits = v.abs().to_bits();
    let exponent = ((bits >> 52) & 0x7ff) as i32 - 1023 - 52;
    let significand = ((bits & ((1u64 << 52) - 1)) | (1u64 << 52)) as u128 * 10;
    if exponent >= 0 {
        return v;
    }
    let shift = (-exponent) as u32;
    if shift >= 128 {
        return 0.0;
    }
    let divisor = 1u128 << shift;
    let rounded = significand / divisor + u128::from(significand % divisor >= divisor / 2);
    (rounded as f64 / 10.0).copysign(v)
}

pub fn calculate_static_alignment(
    goal: RaceGoal,
    season: Season,
    p: &TuningCarParams,
) -> StaticAlignment {
    let mass = positive(p.weight, 1350.0);
    let wf = positive(p.weight_distribution, 54.0) / 100.0;
    let wr = 1.0 - wf;
    let drive = p
        .drivetrain
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or("AWD");
    let fw = nonzero(p.front_tire_width, 245.0);
    let rw = nonzero(p.rear_tire_width, 275.0);
    let hw_f = r1(fw * (nonzero(p.front_tire_aspect, 40.0) / 100.0));
    let hw_r = r1(rw * (nonzero(p.rear_tire_aspect, 35.0) / 100.0));
    let bias = if matches!(season, Season::Spring | Season::Winter) {
        0.5
    } else {
        -0.5
    };
    let (pc_f, pc_r, hot, cf, cr, tf, tr, caster) = match goal {
        RaceGoal::Drift => (
            32.0 + 2.0 * mass * wf / 1000.0 + bias,
            19.5 + mass * wr / 1000.0 + bias,
            21.0,
            -4.8,
            -0.5,
            "+1.2°",
            "-0.3°",
            7.0,
        ),
        RaceGoal::Rally | RaceGoal::DangerSign => {
            let cross =
                goal == RaceGoal::Rally && p.rally_profile == Some(RallyProfile::CrossCountry);
            (
                22.0 + 2.0 * mass * wf / 1000.0 + 0.02 * hw_f + bias,
                21.5 + 2.0 * mass * wr / 1000.0 + 0.02 * hw_r + bias,
                if cross { 28.5 } else { 27.5 },
                if cross { -0.8 } else { -1.3 },
                if cross { -0.5 } else { -0.8 },
                if cross { "0.0°" } else { "+0.2°" },
                "0.0°",
                6.0,
            )
        }
        RaceGoal::Drag => {
            let (front, rear) = if drive == "FWD" {
                (15.0 + 1.5 * mass * wf / 1000.0 + bias, 38.0 + bias)
            } else {
                (38.0 + bias, 15.0 + 1.5 * mass * wr / 1000.0 + bias)
            };
            (front, rear, 23.5, 0.0, -0.1, "0.0°", "0.0°", 7.0)
        }
        RaceGoal::Road => {
            let (df, dr) = match drive {
                "FWD" => (1.5, -0.5),
                "RWD" => (0.5, 0.0),
                _ => (0.2, 0.0),
            };
            (
                28.5 + 2.5 * (mass * wf / 1000.0 - 0.7) - 0.005 * (fw - 245.0) + df + bias,
                28.0 + 2.5 * (mass * wr / 1000.0 - 0.7) - 0.005 * (rw - 245.0) + dr + bias,
                32.5,
                -fixed1(1.5 + 0.8 * wf + 0.2),
                -fixed1(0.8 + 0.6 * wr + 0.2),
                "+0.1°",
                "-0.1°",
                fixed1(5.0 + 2.0 * wf),
            )
        }
    };
    StaticAlignment {
        pc_f: r1(pc_f),
        pc_r: r1(pc_r),
        target_phot: hot,
        season_bias: bias,
        camber: Axle {
            front: cf,
            rear: cr,
        },
        toe: Axle {
            front: tf.into(),
            rear: tr.into(),
        },
        caster,
        hw_f,
        hw_r,
    }
}
