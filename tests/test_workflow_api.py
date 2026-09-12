"""Real application routes with isolated storage and decoded replay evidence."""

import asyncio
import copy
import struct

import main
import pytest
from httpx import ASGITransport, AsyncClient
from road_service import RoadService
from road_store import RoadStore
from telemetry_listener import parse_telemetry_packet
from telemetry_sqlite import TelemetrySQLite
from tuning_capture import capture_sample


def packet(timestamp, lap=0, race_time=0.1, last_lap=0):
    raw = bytearray(324)
    struct.pack_into("<iIfff", raw, 0, 1, timestamp, 8000, 800, 5000)
    struct.pack_into("<fff", raw, 44, -0.3, 0.25, 0.5)
    struct.pack_into("<ffff", raw, 100, -20, 21, 22, 23)
    struct.pack_into("<iiii", raw, 116, 1, 0, 1, 0)
    struct.pack_into("<ffff", raw, 164, -0.1, 0.2, 0.3, 0.4)
    struct.pack_into("<iiii", raw, 212, 42, 3, 700, 1)
    struct.pack_into("<fff", raw, 256, 20, 200000, 400)
    struct.pack_into("<ffff", raw, 268, 180, 181, 182, 183)
    struct.pack_into("<ffffH", raw, 296, 59, last_lap, 0.1, race_time, lap)
    struct.pack_into("<BBBBBb", raw, 315, 255, 0, 0, 0, 4, -10)
    parsed = parse_telemetry_packet(bytes(raw))
    assert parsed is not None
    return parsed


def engine_payload():
    bins = [
        {
            "index": index,
            "sampleCount": 10,
            "averageRpm": 3000 + index * 250,
            "averagePowerWatts": 200000,
            "averageTorqueNewtons": 400,
            "rpmSum": (3000 + index * 250) * 10,
            "powerWattsSum": 2000000,
            "torqueNewtonsSum": 4000,
        }
        for index in range(6, 15)
    ]
    observation = {
        "schema": "engine-observation/v1",
        "id": "engine-test-42",
        "carId": "42",
        "source": "measured",
        "capturedAt": 1000,
        "dependencyKey": '["42","RWD","NA",300,400]',
        "data": {
            "carId": "42",
            "status": "ready",
            "guidance": "ready",
            "engineMaxRpm": 8000,
            "acceptedMs": 6000,
            "lowestRpm": 3000,
            "highestRpm": 7500,
            "bins": bins,
            "identity": {"ordinal": 42, "carClass": 3, "performanceIndex": 700},
            "observedPeakPower": {"rpm": 7000, "value": 200000},
            "observedPeakTorque": {"rpm": 5000, "value": 400},
        },
    }
    capture = {
        "schemaVersion": "tuning-capture/v1",
        "metadata": {"carId": "42", "gameBuild": "unknown"},
        "samples": [capture_sample(packet(100 + i * 100)) for i in range(61)],
        "recording": {"source": "decoded-websocket"},
        "references": {
            "engineObservationId": observation["id"],
            "dependencyKey": observation["dependencyKey"],
        },
    }
    return {"observation": observation, "capture": capture}


@pytest.mark.asyncio
async def test_main_routes_measurement_baseline_multilap_capture_and_restart(
    tmp_path, monkeypatch
):
    db = TelemetrySQLite(str(tmp_path / "sessions.db"))
    service = RoadService(db, RoadStore(db.db_path))
    monkeypatch.setattr(main, "road_service", service)
    async with AsyncClient(
        transport=ASGITransport(app=main.app), base_url="http://test"
    ) as client:
        payload = engine_payload()
        responses = await asyncio.gather(
            *(
                client.post("/api/road/engine-observations", json=payload)
                for _ in range(2)
            )
        )
        assert [r.status_code for r in responses] == [200, 200]
        assert len(service.store.list(kind="engine-observation")) == 1
        assert (await client.get("/api/road/engine-observations")).json() == [
            payload["observation"]
        ]
        assert (
            await client.get("/api/road/engine-observations/engine-test-42/capture")
        ).json() == payload["capture"]
        changed = copy.deepcopy(payload)
        changed["observation"]["capturedAt"] += 1
        assert (
            await client.post("/api/road/engine-observations", json=changed)
        ).status_code == 422

        recommendation = {
            "formulaVersion": "tuningMath/measured-workflow-v1",
            "inputSnapshot": {
                "carId": "42",
                "engineObservation": payload["observation"],
            },
            "fields": {"pressure.front": {"value": 28, "unit": "psi"}},
        }
        service.observe(packet(100))
        service.observe(packet(200))
        request = {
            "identity": service.live()["identity"],
            "carName": "Test",
            "event": {"name": "Synthetic circuit", "format": "circuit"},
            "recommendation": recommendation,
        }
        response = await client.post("/api/road/workflows", json=request)
        assert response.status_code == 200, response.text
        work = response.json()
        assert work["gameBuild"] == "unknown"
        prefix = "/api/road/workflows/" + work["id"]
        setup = service.store.list(work["id"], "setup")[0]
        assert setup["fields"]["pressure.front"]["source"] == "estimate"
        start = {
            "setupId": setup["id"],
            "settingsConfirmed": True,
            "inputSnapshot": recommendation["inputSnapshot"],
        }
        mismatch = {**start, "inputSnapshot": {"carId": "43"}}
        assert (await client.post(prefix + "/runs", json=mismatch)).status_code == 409
        response = await client.post(prefix + "/runs", json=start)
        assert response.status_code == 200, response.text
        run = response.json()
        # Lap clocks reset, but one armed Road run and one recorder session survive.
        for lap in range(7):
            service.observe(packet(300 + lap * 200, lap, 0.1, 59 + lap if lap else 0))
            service.observe(packet(400 + lap * 200, lap, 59, 59 + lap if lap else 0))
            assert service.active["id"] == run["id"]
            assert service.recorder.current_session_id == run["sessionId"]
        service.observe(packet(1800, 7, 0.1, 66))
        assert (await client.post("/api/road/stop")).status_code == 200
        docs = (await client.get(prefix)).json()
        assert sum(d["kind"] == "run" for d in docs) == 1
        summary = next(d for d in docs if d["kind"] == "summary")
        assert len(summary["observations"]["laps"]) == 8
        assert len(db.list_all_sessions()) == 1
        header = db.list_all_sessions()[0]
        assert (
            header["car_ordinal"],
            header["car_name"],
            header["car_pi"],
            header["car_class"],
        ) == (42, "Test", 700, 3)
        exported = (await client.get(prefix + "/runs/" + run["id"] + "/capture")).json()
        assert exported["schemaVersion"] == "tuning-capture/v1"
        assert exported["metadata"]["gameBuild"] == "unknown"
        assert exported["references"]["setupId"] == setup["id"]
        first = exported["samples"][0]
        assert first["angularVelocity"] == pytest.approx([-0.3, 0.25, 0.5])
        assert first["wheelRotationSpeed"] == [-20, 21, 22, 23]
        assert first["wheelOnRumbleStrip"] == [1, 0, 1, 0]
        assert first["tireSlipAngle"] == pytest.approx([-0.1, 0.2, 0.3, 0.4])
        assert first["powerWatts"] == 200000 and first["torqueNewtons"] == 400
        assert (
            await client.post(
                "/api/road/compatibility",
                json={"discipline": "Rally", "recommendation": recommendation},
            )
        ).status_code == 200
        await service.shutdown()
        restored = RoadService(TelemetrySQLite(db.db_path), RoadStore(db.db_path))
        monkeypatch.setattr(main, "road_service", restored)
        await restored.recover()
        assert (await client.get(prefix)).json() == docs
        assert len((await client.get("/api/road/compatibility")).json()) == 1
        assert (
            await client.get(prefix + "/runs/" + run["id"] + "/capture")
        ).json() == exported
        await restored.shutdown()


@pytest.mark.asyncio
async def test_engine_api_rejects_incomplete_or_mismatched_evidence(
    tmp_path, monkeypatch
):
    db = TelemetrySQLite(str(tmp_path / "evidence.db"))
    service = RoadService(db, RoadStore(db.db_path))
    monkeypatch.setattr(main, "road_service", service)
    async with AsyncClient(
        transport=ASGITransport(app=main.app), base_url="http://test"
    ) as client:
        for override in (
            {"acceptedMs": 500},
            {"bins": []},
            {"highestRpm": 6000},
            {"engineMaxRpm": None},
            {"identity": None},
        ):
            invalid = engine_payload()
            invalid["observation"]["data"].update(override)
            assert (
                await client.post("/api/road/engine-observations", json=invalid)
            ).status_code == 422
        invalid = engine_payload()
        invalid["capture"]["metadata"]["carId"] = "43"
        assert (
            await client.post("/api/road/engine-observations", json=invalid)
        ).status_code == 422
        assert service.store.list(kind="engine-observation") == []
        payload_key = engine_payload()["observation"]["dependencyKey"]
        for references in (
            None,
            {},
            {"engineObservationId": "another", "dependencyKey": payload_key},
            {"engineObservationId": "engine-test-42", "dependencyKey": "different"},
        ):
            invalid = engine_payload()
            invalid["capture"]["references"] = references
            assert (
                await client.post("/api/road/engine-observations", json=invalid)
            ).status_code == 422
