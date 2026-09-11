"""Offroad / Rally workflow API inputs and models."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


def validate_offroad_parameter_unit(parameter: str, unit: str) -> None:
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
    }
    if unit not in units.get(family, set()):
        raise ValueError("The selected unit does not match this game control")


class OffroadInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class OffroadIdentity(OffroadInput):
    ordinal: int = Field(default=42, gt=0)
    performanceIndex: int = Field(default=700, ge=0, le=9999)
    drivetrain: int = Field(default=1, ge=0, le=2)


class OffroadEvent(OffroadInput):
    name: str = Field(default="Offroad Event", min_length=1, max_length=160)
    format: Literal["circuit", "sprint"] = "sprint"
    driverAssists: str = Field(default="unknown", max_length=160)
    conditions: str = Field(default="unknown", max_length=160)


class CreateOffroadWorkflow(OffroadInput):
    identity: OffroadIdentity = Field(default_factory=OffroadIdentity)
    carName: str = Field(default="Offroad Car", min_length=1, max_length=160)
    configuration: str = Field(default="unknown", max_length=160)
    event: OffroadEvent = Field(default_factory=OffroadEvent)


class OffroadSetting(OffroadInput):
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


class CreateOffroadCandidate(OffroadInput):
    baselineRunId: str = Field(min_length=1, max_length=80)
    parameter: str = Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_.]{0,63}$")
    baseline: OffroadSetting
    candidateValue: float
    baselineValueUnchanged: Literal[True]
    hypothesis: str = Field(min_length=1, max_length=400)
    source: Literal["user-specified", "one-game-step-exploration"]

    @model_validator(mode="after")
    def valid_candidate(self):
        validate_offroad_parameter_unit(self.parameter, self.baseline.unit)
        if self.parameter in ("diff.acceleration", "diff.deceleration"):
            raise ValueError("Choose the front or rear differential control explicitly")
        OffroadSetting.model_validate(
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


class StartOffroadRun(OffroadInput):
    setupId: str = Field(min_length=1, max_length=80)
    settingsConfirmed: bool = True
    otherSettings: Literal["unchanged", "unknown", "changed"] = "unchanged"
    tires: Literal["unchanged", "unknown", "changed"] = "unchanged"
    conditions: Literal["unchanged", "unknown", "changed"] = "unchanged"
    driverAssists: Literal["unchanged", "unknown", "changed"] = "unchanged"


class OffroadFinish(OffroadInput):
    completed: Literal[True]
    timeSeconds: float = Field(gt=0, le=86400)
    clean: Literal["confirmed", "unknown", "incident"] = "unknown"
    source: Literal["game-confirmed"] = "game-confirmed"


class OffroadComparison(OffroadInput):
    baselineRunIds: list[str] = Field(min_length=1, max_length=20)
    candidateRunIds: list[str] = Field(min_length=1, max_length=20)


class OffroadDecision(OffroadInput):
    reportId: str = Field(min_length=1, max_length=80)
    choice: Literal["keep-baseline", "keep-candidate", "retest-baseline"]


class OffroadStaticInput(OffroadInput):
    value: float
    unit: str = Field(max_length=16)
    source: Literal["game-confirmed"] = "game-confirmed"


class OffroadEngineEvidence(OffroadInput):
    observationId: str = Field(min_length=1, max_length=80)
    carId: str = Field(min_length=1, max_length=80)
    performanceIndex: int = Field(ge=0, le=9999)
    capturedAt: float = Field(gt=0)
    source: Literal["measured-summary"]
    engineMaxRpm: float = Field(gt=0)
    peakPowerRpm: float = Field(gt=0)
    peakTorqueRpm: float = Field(gt=0)
    acceptedMs: float = Field(ge=6000)
    bins: list[dict[str, float]] = Field(min_length=8, max_length=16)

    @model_validator(mode="after")
    def valid_engine(self):
        if max(self.peakPowerRpm, self.peakTorqueRpm) > self.engineMaxRpm:
            raise ValueError("Measured peak RPM exceeds the observed engine limit")
        return self


class OffroadInitialSetup(OffroadInput):
    parentSetupId: str = Field(min_length=1, max_length=80)
    section: Literal[
        "pressure",
        "springs",
        "height",
        "arb",
        "damping",
        "alignment",
        "differential",
        "gearing",
    ]
    inputs: dict[str, OffroadStaticInput] = Field(max_length=32)
    fields: dict[str, OffroadSetting] = Field(min_length=1, max_length=16)
    gameRangesConfirmed: Literal[True]
    formulaVersion: Literal["offroad-initial/neutral-v1"]
    engineObservation: OffroadEngineEvidence | None = None

    @model_validator(mode="after")
    def valid_section(self):
        families = {
            "springs": {"spring"},
            "damping": {"rebound", "bump"},
            "alignment": {"camber", "toe", "caster"},
            "differential": {"diff"},
        }
        for key, value in self.fields.items():
            validate_offroad_parameter_unit(key, value.unit)
            if key.split(".")[0] not in families.get(self.section, {self.section}):
                raise ValueError("The output field belongs to another tuning section")
        if self.section == "gearing" and self.engineObservation is None:
            raise ValueError("Save the measured engine evidence with the gearing draft")
        return self
