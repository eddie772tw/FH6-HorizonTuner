//! Independent ICE gearing identities. Workflow, evidence and chassis versions
//! describe different contracts and must never implicitly select a new model.
use super::RaceGoal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AegoModel {
    #[serde(rename = "aego-road-joint/v2")]
    RoadJointV2,
    #[serde(rename = "aego-road-launch-envelope/v3")]
    RoadLaunchV3,
    #[serde(rename = "aego-rally/v1")]
    RallyV1,
    #[serde(rename = "aego-drift/v1")]
    DriftV1,
    #[serde(rename = "aego-drag/v1")]
    DragV1,
}

impl AegoModel {
    /// Production selection before the candidate models are promoted. Neither
    /// DangerSign nor EV/CVT is an ICE AEGO discipline in this registry.
    pub fn production(goal: RaceGoal) -> Option<Self> {
        match goal {
            RaceGoal::Road => Some(Self::RoadLaunchV3),
            RaceGoal::Rally => Some(Self::RallyV1),
            RaceGoal::Drift => Some(Self::DriftV1),
            RaceGoal::Drag => Some(Self::DragV1),
            RaceGoal::DangerSign => None,
        }
    }

    pub fn goal(self) -> RaceGoal {
        match self {
            Self::RoadJointV2 | Self::RoadLaunchV3 => RaceGoal::Road,
            Self::RallyV1 => RaceGoal::Rally,
            Self::DriftV1 => RaceGoal::Drift,
            Self::DragV1 => RaceGoal::Drag,
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Self::RoadJointV2 => "aego-road-joint/v2",
            Self::RoadLaunchV3 => "aego-road-launch-envelope/v3",
            Self::RallyV1 => "aego-rally/v1",
            Self::DriftV1 => "aego-drift/v1",
            Self::DragV1 => "aego-drag/v1",
        }
    }

    pub fn parse_for_goal(id: &str, goal: RaceGoal) -> Result<Self, String> {
        let model: Self = serde_json::from_value(serde_json::Value::String(id.into()))
            .map_err(|_| "Unsupported AEGO model version".to_string())?;
        if model.goal() != goal {
            return Err("AEGO model does not match recommendation goal".into());
        }
        Ok(model)
    }
}

/// Resolve only recorded historical combinations. Missing IDs are not a request
/// for the latest model. This mapping remains frozen when production changes.
pub fn historical_model(
    formula: &str,
    workflow_schema: &str,
    goal: RaceGoal,
    claimed_model: Option<&str>,
) -> Result<Option<AegoModel>, String> {
    let expected = match (formula, workflow_schema) {
        ("rust/ice-measured-workflow-v1", "tuning-workflow-result/v1") => match goal {
            RaceGoal::Road => Some(AegoModel::RoadJointV2),
            RaceGoal::Rally => Some(AegoModel::RallyV1),
            RaceGoal::Drift => Some(AegoModel::DriftV1),
            RaceGoal::Drag => Some(AegoModel::DragV1),
            RaceGoal::DangerSign => None,
        },
        ("rust/ice-measured-workflow-v2", "tuning-workflow-result/v1")
            if goal == RaceGoal::Road =>
        {
            Some(AegoModel::RoadLaunchV3)
        }
        ("rust/ice-measured-workflow-v3", "tuning-workflow-result/v2") => match goal {
            RaceGoal::Road => Some(AegoModel::RoadLaunchV3),
            RaceGoal::Rally => Some(AegoModel::RallyV1),
            RaceGoal::Drift => Some(AegoModel::DriftV1),
            RaceGoal::Drag => Some(AegoModel::DragV1),
            RaceGoal::DangerSign => None,
        },
        ("rust/ev-measured-workflow-v1", "tuning-workflow-result/v1")
        | ("rust/ev-measured-workflow-v2", "tuning-workflow-result/v2")
        | ("rust/ev-measured-workflow-v3", "tuning-workflow-result/v3") => None,
        _ => return Err("Unsupported recommendation formula/schema/goal combination".into()),
    };
    if let Some(id) = claimed_model {
        let claimed = AegoModel::parse_for_goal(id, goal)?;
        if expected != Some(claimed) {
            return Err("AEGO model does not match historical formula version".into());
        }
    }
    Ok(expected)
}
