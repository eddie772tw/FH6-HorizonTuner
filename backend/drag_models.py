"""Drag tuning workflow API inputs and models."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


def validate_drag_parameter_unit(parameter: str, unit: str) -> None:
    family = parameter.split(".")[0]
    units = {
        "pressure": {"psi", "bar", "kPa"},
        "spring": {"kgf/mm", "lb/in", "N/mm"},
        "height": {"cm", "in"},
        "rebound": {"slider"},
        "bump": {"slider"},
        "diff": {"%"},
        "gearing": {"ratio"},
    }
    if unit not in units.get(family, set()):
        raise ValueError("The selected unit does not match this game control")


class DragInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class DragIdentity(DragInput):
    ordinal: int = Field(default=42, gt=0)
    performanceIndex: int = Field(default=700, ge=0, le=9999)
    drivetrain: int = Field(default=1, ge=0, le=2)


class CreateDragWorkflow(DragInput):
    identity: DragIdentity = Field(default_factory=DragIdentity)
    carName: str = Field(default="Drag Car", min_length=1, max_length=160)
    configuration: str = Field(default="unknown", max_length=160)
    eventName: str = Field(default="Drag Event", min_length=1, max_length=160)
    driverAssists: str = Field(default="unknown", max_length=160)


class DragSetting(DragInput):
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


class CreateDragCandidate(DragInput):
    baselineRunId: str = Field(min_length=1, max_length=80)
    parameter: str = Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_.]{0,63}$")
    baseline: DragSetting
    candidateValue: float
    baselineValueUnchanged: Literal[True]
    hypothesis: str = Field(min_length=1, max_length=400)
    source: Literal["user-specified", "one-game-step-exploration"]

    @model_validator(mode="after")
    def valid_candidate(self):
        validate_drag_parameter_unit(self.parameter, self.baseline.unit)
        DragSetting.model_validate(
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


class StartDragRun(DragInput):
    setupId: str = Field(min_length=1, max_length=80)
    settingsConfirmed: bool = True
    otherSettings: Literal["unchanged", "unknown", "changed"] = "unchanged"
    tires: Literal["unchanged", "unknown", "changed"] = "unchanged"
    driverAssists: Literal["unchanged", "unknown", "changed"] = "unchanged"


class DragFinish(DragInput):
    completed: Literal[True]
    timeSeconds: float = Field(gt=0, le=120)
    clean: Literal["confirmed", "unknown", "incident"] = "unknown"
    source: Literal["game-confirmed"] = "game-confirmed"


class DragComparison(DragInput):
    baselineRunIds: list[str] = Field(min_length=1, max_length=20)
    candidateRunIds: list[str] = Field(min_length=1, max_length=20)


class DragDecision(DragInput):
    reportId: str = Field(min_length=1, max_length=80)
    choice: Literal["keep-baseline", "keep-candidate", "retest-baseline"]
