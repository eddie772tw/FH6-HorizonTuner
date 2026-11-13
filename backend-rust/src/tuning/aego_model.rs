//! Independent ICE gearing identities. Workflow, evidence and chassis versions
//! describe different contracts and must never implicitly select a new model.
use super::RaceGoal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AegoModel {
    #[serde(rename = "aego-road-launch-envelope/v3")]
    RoadLaunchV3,
    #[serde(rename = "aego-rally-joint/v1")]
    RallyJointV1,
    #[serde(rename = "aego-drift-working/v1")]
    DriftWorkingV1,
    #[serde(rename = "aego-drag-joint/v1")]
    DragJointV1,
}

impl AegoModel {
    /// Current production selection. Neither
    /// DangerSign nor EV/CVT is an ICE AEGO discipline in this registry.
    pub fn production(goal: RaceGoal) -> Option<Self> {
        match goal {
            RaceGoal::Road => Some(Self::RoadLaunchV3),
            RaceGoal::Rally => Some(Self::RallyJointV1),
            RaceGoal::Drift => Some(Self::DriftWorkingV1),
            RaceGoal::Drag => Some(Self::DragJointV1),
            RaceGoal::DangerSign => None,
        }
    }

    pub fn goal(self) -> RaceGoal {
        match self {
            Self::RoadLaunchV3 => RaceGoal::Road,
            Self::RallyJointV1 => RaceGoal::Rally,
            Self::DriftWorkingV1 => RaceGoal::Drift,
            Self::DragJointV1 => RaceGoal::Drag,
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Self::RoadLaunchV3 => "aego-road-launch-envelope/v3",
            Self::RallyJointV1 => "aego-rally-joint/v1",
            Self::DriftWorkingV1 => "aego-drift-working/v1",
            Self::DragJointV1 => "aego-drag-joint/v1",
        }
    }

    pub fn parse_for_goal(id: &str, goal: RaceGoal) -> Result<Self, String> {
        if super::archive::RETIRED_MODELS.contains(&id) {
            return Err(super::archive::RETIRED_MESSAGE.into());
        }
        let model: Self = serde_json::from_value(serde_json::Value::String(id.into()))
            .map_err(|_| "Unsupported AEGO model version".to_string())?;
        if model.goal() != goal {
            return Err("AEGO model does not match recommendation goal".into());
        }
        Ok(model)
    }
}

/// Resolve supported saved versions without falling back to a production selector.
/// Retired ICE IDs are archive metadata and have no executable enum variants.
pub fn model_for_saved_recommendation(
    formula: &str,
    workflow_schema: &str,
    goal: RaceGoal,
    claimed_model: Option<&str>,
) -> Result<Option<AegoModel>, String> {
    if formula == "rust/ice-measured-workflow-v4"
        && ["tuning-workflow-result/v1", "tuning-workflow-result/v2"].contains(&workflow_schema)
    {
        if goal == RaceGoal::DangerSign {
            return if claimed_model.is_none() {
                Ok(None)
            } else {
                Err("DangerSign has no ICE AEGO model ID".into())
            };
        }
        return AegoModel::parse_for_goal(
            claimed_model.ok_or("AEGO v4 requires an explicit model version")?,
            goal,
        )
        .map(Some);
    }
    if super::archive::RETIRED_FORMULAS.contains(&formula) {
        return Err(super::archive::RETIRED_MESSAGE.into());
    }
    let expected = match (formula, workflow_schema) {
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
