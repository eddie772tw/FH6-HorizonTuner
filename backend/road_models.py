"""Road workflow API inputs. Snapshot outputs use the same named JSON fields."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


def validate_parameter_unit(parameter: str, unit: str) -> None:
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


class RoadInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class RoadIdentity(RoadInput):
    ordinal: int = Field(gt=0)
    performanceIndex: int = Field(ge=0, le=9999)
    drivetrain: int = Field(ge=0, le=2)


class RoadEvent(RoadInput):
    name: str = Field(min_length=1, max_length=160)
    format: Literal["circuit", "sprint"]
    driverAssists: str = Field(default="unknown", max_length=160)
    conditions: str = Field(default="unknown", max_length=160)


class CreateRoadWorkflow(RoadInput):
    identity: RoadIdentity
    carName: str = Field(min_length=1, max_length=160)
    configuration: str = Field(default="unknown", max_length=160)
    event: RoadEvent


class RoadSetting(RoadInput):
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


class CreateRoadCandidate(RoadInput):
    baselineRunId: str = Field(min_length=1, max_length=80)
    parameter: str = Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_.]{0,63}$")
    baseline: RoadSetting
    candidateValue: float
    baselineValueUnchanged: Literal[True]
    hypothesis: str = Field(min_length=1, max_length=400)
    source: Literal["user-specified", "one-game-step-exploration"]

    @model_validator(mode="after")
    def valid_candidate(self):
        validate_parameter_unit(self.parameter, self.baseline.unit)
        if self.parameter in ("diff.acceleration", "diff.deceleration"):
            raise ValueError("Choose the front or rear differential control explicitly")
        RoadSetting.model_validate(
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


class StartRoadRun(RoadInput):
    setupId: str = Field(min_length=1, max_length=80)
    settingsConfirmed: Literal[True]
    otherSettings: Literal["unchanged", "unknown", "changed"] = "unknown"
    tires: Literal["unchanged", "unknown", "changed"] = "unknown"
    conditions: Literal["unchanged", "unknown", "changed"] = "unknown"
    driverAssists: Literal["unchanged", "unknown", "changed"] = "unknown"


class RoadFinish(RoadInput):
    completed: Literal[True]
    timeSeconds: float = Field(gt=0, le=86400)
    clean: Literal["confirmed", "unknown", "incident"] = "unknown"
    source: Literal["game-confirmed"] = "game-confirmed"


class RoadComparison(RoadInput):
    baselineRunIds: list[str] = Field(min_length=1, max_length=20)
    candidateRunIds: list[str] = Field(min_length=1, max_length=20)


class RoadDecision(RoadInput):
    reportId: str = Field(min_length=1, max_length=80)
    choice: Literal["keep-baseline", "keep-candidate", "retest-baseline"]


class RoadStaticInput(RoadInput):
    value: float
    unit: str = Field(max_length=16)
    source: Literal["game-confirmed"] = "game-confirmed"


class RoadEngineEvidence(RoadInput):
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


class RoadInitialSetup(RoadInput):
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
    inputs: dict[str, RoadStaticInput] = Field(max_length=32)
    fields: dict[str, RoadSetting] = Field(min_length=1, max_length=16)
    gameRangesConfirmed: Literal[True]
    formulaVersion: Literal["road-initial/neutral-v1"]
    engineObservation: RoadEngineEvidence | None = None

    @model_validator(mode="after")
    def valid_section(self):
        families = {
            "springs": {"spring"},
            "damping": {"rebound", "bump"},
            "alignment": {"camber", "toe", "caster"},
            "differential": {"diff"},
        }
        for key, value in self.fields.items():
            validate_parameter_unit(key, value.unit)
            if key.split(".")[0] not in families.get(self.section, {self.section}):
                raise ValueError("The output field belongs to another tuning section")
        if self.section == "gearing" and self.engineObservation is None:
            raise ValueError("Save the measured engine evidence with the gearing draft")
        return self
