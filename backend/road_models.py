"""Road workflow API inputs. Snapshot outputs use the same named JSON fields."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from telemetry_contract import finite


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
    gameBuild: str = Field(default="unknown", max_length=160)
    event: RoadEvent
    recommendation: WorkflowRecommendation | None = None


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
    inputSnapshot: dict | None = None
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


class SuggestedField(RoadInput):
    value: float
    unit: str = Field(max_length=16)


class WorkflowRecommendation(RoadInput):
    formulaVersion: Literal["tuningMath/measured-workflow-v1"]
    inputSnapshot: dict
    fields: dict[str, SuggestedField] = Field(min_length=1, max_length=64)

    @model_validator(mode="after")
    def validate_units(self):
        for key, field in self.fields.items():
            validate_parameter_unit(key, field.unit)
        return self


class CompatibilitySnapshot(RoadInput):
    discipline: Literal["Rally", "Drag", "Drift"]
    recommendation: WorkflowRecommendation


class EngineArchiveRequest(RoadInput):
    observation: dict
    capture: dict

    @model_validator(mode="after")
    def validate_capture(self):
        item = self.observation
        data = item.get("data", {})
        metadata = self.capture.get("metadata")
        if not isinstance(data, dict) or not isinstance(metadata, dict):
            raise ValueError("Engine observation and capture metadata must be objects")
        references = self.capture.get("references")
        if (
            not isinstance(references, dict)
            or references.get("engineObservationId") != item.get("id")
            or references.get("dependencyKey") != item.get("dependencyKey")
        ):
            raise ValueError(
                "The capture must reference this engine observation and configuration"
            )
        limit = data.get("engineMaxRpm")
        bins = data.get("bins")
        identity = data.get("identity")
        if (
            item.get("schema") != "engine-observation/v1"
            or item.get("source") != "measured"
            or not finite(item.get("capturedAt"))
            or not isinstance(item.get("dependencyKey"), str)
            or not isinstance(item.get("id"), str)
            or not 1 <= len(item["id"]) <= 80
            or self.capture.get("schemaVersion") != "tuning-capture/v1"
            or metadata.get("carId") != item.get("carId")
            or data.get("carId") != item.get("carId")
            or not isinstance(identity, dict)
            or str(identity.get("ordinal")) != item.get("carId")
            or not finite(identity.get("performanceIndex"))
            or not finite(identity.get("carClass"))
            or data.get("status") != "ready"
            or not finite(data.get("acceptedMs"))
            or data.get("acceptedMs", 0) < 6000
            or not finite(limit)
            or limit <= 0
            or not finite(data.get("lowestRpm"))
            or not 0 < data["lowestRpm"] <= limit * 0.4
            or not finite(data.get("highestRpm"))
            or not limit * 0.9 <= data["highestRpm"] <= limit
            or not isinstance(bins, list)
            or not 8 <= len(bins) <= 16
            or not isinstance(self.capture.get("samples"), list)
            or not 1 <= len(self.capture["samples"]) <= 30000
        ):
            raise ValueError(
                "A completed engine observation and its capture are required"
            )
        indices = set()
        for band in bins:
            if (
                not isinstance(band, dict)
                or not isinstance(band.get("index"), int)
                or not 0 <= band["index"] < 16
            ):
                raise ValueError("Invalid engine observation band")
            indices.add(band["index"])
            if not all(
                finite(band.get(key)) and band[key] > 0
                for key in (
                    "sampleCount",
                    "averageRpm",
                    "averagePowerWatts",
                    "averageTorqueNewtons",
                    "rpmSum",
                    "powerWattsSum",
                    "torqueNewtonsSum",
                )
            ):
                raise ValueError("Incomplete engine observation band")
        if len(indices) != len(bins):
            raise ValueError("Engine observation bands must be unique")
        for key in ("observedPeakPower", "observedPeakTorque"):
            peak = data.get(key)
            if (
                not isinstance(peak, dict)
                or not finite(peak.get("rpm"))
                or not 0 < peak["rpm"] <= limit
                or not finite(peak.get("value"))
                or peak["value"] <= 0
            ):
                raise ValueError("Invalid measured engine peak")
        if not all(isinstance(sample, dict) for sample in self.capture["samples"]):
            raise ValueError("Capture samples must be objects")
        if not any(
            str(sample.get("carOrdinal")) == item["carId"]
            and sample.get("engineMaxRpm") == limit
            and finite(sample.get("powerWatts"))
            and finite(sample.get("torqueNewtons"))
            for sample in self.capture["samples"]
        ):
            raise ValueError(
                "The capture must contain decoded engine channels for this car"
            )
        # A summary cannot claim more accepted time than its saved raw capture.
        # This is an integrity bound; the frontend measurement gate still owns
        # WOT acceptance, shift settling and bin/peak calculation.
        timestamps = [sample.get("timestampMS") for sample in self.capture["samples"]]
        recorded_ms = sum(
            b - a
            for a, b in zip(timestamps, timestamps[1:])
            if finite(a) and finite(b) and 0 < b - a <= 1000
        )
        if data["acceptedMs"] > recorded_ms + 1e-6:
            raise ValueError("Accepted measurement time exceeds the saved capture")
        return self
