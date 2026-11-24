"""Use the running Rust sidecar for profile normalization, measurement and solving."""

import base64
import hashlib
import json
import os
import re
import socket
import struct
import time
import unicodedata
import urllib.error
import urllib.request
from contextlib import contextmanager


def request(device, path, body=None):
    device.guard()
    url = f"http://127.0.0.1:{int(device.port)}{path}"
    req = urllib.request.Request(
        url,
        data=None if body is None else json.dumps(body, allow_nan=False).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read(2048).decode("utf-8", "replace")
        raise RuntimeError(f"Rust {path} ({error.code}): {detail}") from error


def identify(device, visible_name):
    def name_key(value):
        return re.sub(r"[^\w]", "", unicodedata.normalize("NFKC", value).casefold())

    query = name_key(visible_name)
    if len(query) < 7 or not query[:4].isdigit():
        raise ValueError(f"車名或年份不完整：{visible_name}")
    cars = request(device, "/api/cars/database")
    names = {key: name_key(value["display_name"]) for key, value in cars.items()}
    matches = [key for key, name in names.items() if name == query]
    if not matches:
        matches = [key for key, name in names.items() if name.startswith(query)]
    if len(matches) != 1:
        raise ValueError(f"車庫車名無法唯一對應車輛編號：{visible_name}")
    return matches[0]


def workflow_input(device, profile):
    return {
        "schemaVersion": "tuning-workflow-result/v2",
        "profile": request(device, "/api/tuning/profile", profile),
        "goal": device.goal,
        "season": device.season,
        "engine": None,
        "ev": None,
        "inputSnapshot": {"carId": str(profile["carId"])},
    }


def baseline(device, profile):
    body = workflow_input(device, profile)
    if "baselineCurrent" in profile:
        body["inputSnapshot"]["baselineCurrent"] = profile["baselineCurrent"]
    return request(device, "/api/tuning/workflow", body)


def solve(device, profile, samples, ready):
    body = workflow_input(device, profile)
    car = body["inputSnapshot"]["carId"]
    obs_id = f"auto-{car}-{time.time_ns()}"
    dependency = json.dumps(
        [
            car,
            *(
                body["profile"][k]
                for k in ("drivetrain", "induction", "maxHp", "maxTorque")
            ),
        ],
        separators=(",", ":"),
    )
    body["evidence"] = {
        "kind": "engine-capture",
        "observation": {
            "id": obs_id,
            "schema": "engine-observation/v1",
            "carId": car,
            "source": "measured",
            "dependencyKey": dependency,
            "data": ready,
        },
        "capture": {
            "schemaVersion": "tuning-capture/v1",
            "metadata": {"carId": car},
            "references": {"dependencyKey": dependency, "engineObservationId": obs_id},
            "samples": samples,
        },
    }
    result = request(device, "/api/tuning/workflow", body)
    if not result["readiness"]["measuredEngine"] or not result["recommendation"]:
        raise RuntimeError("實測資料未通過 Rust 工作流資格檢查。")
    calculation = result["recommendation"]["inputSnapshot"]["engineCalculation"]
    rpm = {
        "engine.effectiveRedline": calculation.get("effectiveRedline"),
        "engine.peakPowerRpm": calculation["peakPower"]["rpm"],
        "engine.peakTorqueRpm": calculation["peakTorque"]["rpm"],
    }
    device.observed(
        {name: f"{value:.0f} rpm" for name, value in rpm.items() if value is not None}
    )
    return result


@contextmanager
def telemetry(port, timeout=2):
    """Receive uncompressed, unfragmented JSON frames from the local Axum telemetry endpoint."""
    key = base64.b64encode(os.urandom(16)).decode()
    host = f"127.0.0.1:{int(port)}"
    with (
        socket.create_connection(("127.0.0.1", int(port)), timeout=timeout) as sock,
        sock.makefile("rb") as stream,
    ):
        sock.sendall(
            (
                f"GET /ws/telemetry HTTP/1.1\r\nHost: {host}\r\nConnection: Upgrade\r\n"
                f"Upgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: {key}\r\n\r\n"
            ).encode()
        )
        if not stream.readline(2048).startswith(b"HTTP/1.1 101 "):
            raise RuntimeError("遙測 WebSocket 連線失敗")
        headers = {}
        for _ in range(32):
            line = stream.readline(8192)
            if line == b"\r\n":
                break
            name, _, value = line.partition(b":")
            headers[name.lower()] = value.strip()
        expected = base64.b64encode(
            hashlib.sha1(
                (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()
            ).digest()
        )
        if headers.get(b"sec-websocket-accept") != expected:
            raise RuntimeError("遙測 WebSocket 交握失敗")

        def take(n):
            raw = stream.read(n)
            if len(raw) != n:
                raise ConnectionError("遙測連線中斷")
            return raw

        def receive():
            head, size = take(2)
            if head != 0x81 or size & 0x80:
                raise ConnectionError("遙測連線中斷或格式改變")
            if size == 126:
                size = struct.unpack(">H", take(2))[0]
            elif size == 127:
                size = struct.unpack(">Q", take(8))[0]
            if size > 1_048_576:
                raise ValueError("遙測資料過大")
            return json.loads(take(size))

        yield receive
