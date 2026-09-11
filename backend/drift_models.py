"""Drift tuning workflow API inputs and models. Limitations are declared explicitly; no causal score is fabricated."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


def validate_drift_parameter_unit(parameter: str, unit: str) -> None:
    family = parameter.split(".")[0]
    units = {
        "pressure": {"psi", "bar", "kPa"},
        "spring": {"kgf/mm", "lb/in", "N/mm"},
        "height": {"cm", "in"},
        "arb": {"slider"},
        "rebound": {"slider"},
        "bump": {"slider"},
        "diff": {"%"},
        "camber": {"deg"},
        "toe": {"deg"},
        "caster": {"deg"},
        "gearing": {"ratio"},
        "power": {"%"},
    }
    if unit not in units.get(family, set()):
        raise ValueError("The selected unit does not match this game control")


class DriftInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class DriftIdentity(DriftInput):
    ordinal: int = Field(default=42, gt=0)
    performanceIndex: int = Field(default=700, ge=0, le=9999)
    drivetrain: int = Field(default=1, ge=0, le=2)


class DriftEvent(DriftInput):
    name: str = Field(default="Drift Zone", min_length=1, max_length=160)
    format: Literal["zone", "drift-course"] = "zone"
    driverAssists: str = Field(default="unknown", max_length=160)
    conditions: str = Field(default="unknown", max_length=160)


class CreateDriftWorkflow(DriftInput):
    identity: DriftIdentity = Field(default_factory=DriftIdentity)
    carName: str = Field(default="Drift Car", min_length=1, max_length=160)
    configuration: str = Field(default="unknown", max_length=160)
    event: DriftEvent = Field(default_factory=DriftEvent)


class DriftSetting(DriftInput):
    value: float
    unit: Literal[
        "psi",
        "bar",
        "kPa",
        "kgf/mm",
        "lb/in",
        "N/mm",
        "cm",
        "in",
        "ratio",
        "%",
        "deg",
        "slider",
    ]
    minimum: float
    maximum: float
    step: float = Field(gt=0)
    source: Literal["game-confirmed"] = "game-confirmed"

    @model_validator(mode="after")
    def valid_setting(self):
        if (
            self.minimum >= self.maximum
            or not self.minimum <= self.value <= self.maximum
        ):
            raise ValueError(
                "The game value must be inside the confirmed adjustment range"
            )
        if self.step > self.maximum - self.minimum:
            raise ValueError("The game step exceeds the adjustment range")
        grid = (self.value - self.minimum) / self.step
        if abs(grid - round(grid)) > 1e-5:
            raise ValueError("The value does not follow the confirmed game step")
        return self


class CreateDriftCandidate(DriftInput):
    baselineRunId: str = Field(min_length=1, max_length=80)
    parameter: str = Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_.]{0,63}$")
    baseline: DriftSetting
    candidateValue: float
    baselineValueUnchanged: Literal[True]
    hypothesis: str = Field(min_length=1, max_length=400)
    source: Literal["user-specified", "one-game-step-exploration"]

    @model_validator(mode="after")
    def valid_candidate(self):
        validate_drift_parameter_unit(self.parameter, self.baseline.unit)
        DriftSetting.model_validate(
            {**self.baseline.model_dump(), "value": self.candidateValue}
        )
        if self.baseline.value == self.candidateValue:
            raise ValueError("The candidate must change the selected parameter")
        if (
            self.source == "one-game-step-exploration"
            and abs(abs(self.candidateValue - self.baseline.value) - self.baseline.step)
            > 1e-6
        ):
            raise ValueError(
                "This exploration rule changes exactly one confirmed game step"
            )
        return self


class StartDriftRun(DriftInput):
    setupId: str = Field(min_length=1, max_length=80)
    settingsConfirmed: bool = True
    otherSettings: Literal["unchanged", "unknown", "changed"] = "unchanged"
    tires: Literal["unchanged", "unknown", "changed"] = "unchanged"
    conditions: Literal["unchanged", "unknown", "changed"] = "unchanged"
    driverAssists: Literal["unchanged", "unknown", "changed"] = "unchanged"


class DriftFinish(DriftInput):
    completed: Literal[True]
    score: float = Field(
        ge=0, description="Game-reported drift score, descriptive only"
    )
    durationSeconds: float = Field(gt=0, le=3600)
    source: Literal["game-confirmed"] = "game-confirmed"


class DriftComparison(DriftInput):
    baselineRunIds: list[str] = Field(min_length=1, max_length=20)
    candidateRunIds: list[str] = Field(min_length=1, max_length=20)


class DriftDecision(DriftInput):
    reportId: str = Field(min_length=1, max_length=80)
    choice: Literal["keep-baseline", "keep-candidate", "retest-baseline"]
