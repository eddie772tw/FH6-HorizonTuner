"""Opt-in populated API benchmark against the unchanged v1.6 Python sidecar.

No frontend or user data is opened. Each process gets a fresh copy of the same
fixture database, captures and language file. Run after building release bins.
"""

import argparse
import http.client
import json
import os
import platform
import shutil
import socket
import sqlite3
import struct
import subprocess
import sys
import time
from pathlib import Path

from benchmark_release_algorithms import compare, points
from benchmark_release_sidecars import (
    BASELINE,
    REPO,
    distribution,
    extract_sidecar,
    request,
    sha,
)
from websockets.sync.client import connect


def fixture(work, count):
    """Use release schema/normalization, shared by both runtime generations."""
    source = work / "python-reference"
    source.mkdir()
    for name in ("telemetry_sqlite", "telemetry_contract", "road_analysis"):
        (source / f"{name}.py").write_bytes(
            subprocess.check_output(
                ["git", "show", f"{BASELINE}:backend/{name}.py"], cwd=REPO
            )
        )
    sys.path.insert(0, str(source))
    from telemetry_sqlite import TelemetrySQLite

    db = work / "fixture.db"
    store = TelemetrySQLite(str(db))
    store.create_session("bench", 42, "Benchmark Car", 2, 700, 2000)
    samples = points(count)
    store.insert_points_batch("bench", samples)
    store.finalize_session("bench")
    with sqlite3.connect(db) as conn:
        conn.executemany(
            "INSERT INTO sessions(session_id,car_name,start_time) VALUES(?,?,?)",
            [(f"older-{i:04}", "Benchmark Car", i) for i in range(1000)],
        )
        conn.executescript(
            "CREATE TABLE road_documents(id TEXT PRIMARY KEY,workflow_id TEXT NOT NULL,"
            "kind TEXT NOT NULL,created_at REAL NOT NULL,document TEXT NOT NULL);"
            "CREATE INDEX road_workflow_idx ON road_documents(workflow_id,created_at);"
        )
        for i in range(20):
            d = {
                "id": f"obs-{i}",
                "workflowId": "engine-observations",
                "kind": "engine-observation",
                "schema": "road-workflow/v1",
                "createdAt": i,
                "observation": {"id": f"obs-{i}", "carOrdinal": 42},
                "capture": {"samples": samples[:1000]},
            }
            conn.execute(
                "INSERT INTO road_documents VALUES(?,?,?,?,?)",
                (d["id"], d["workflowId"], d["kind"], i, json.dumps(d)),
            )
    captures = work / "captures"
    captures.mkdir()
    for i in range(3):
        (captures / f"capture-{i}.json").write_text(
            json.dumps(
                {
                    "schemaVersion": "tuning-capture/v1",
                    "captureId": f"capture-{i}",
                    "createdAt": "2026-01-01T00:00:00Z",
                    "metadata": {
                        "carOrdinal": 42,
                        "installedParts": {},
                        "surface": "road",
                    },
                    "samples": [
                        {"timestampMs": j * 16, "speedKmh": 60 + j % 80, "channels": p}
                        for j, p in enumerate(samples)
                    ],
                }
            ),
            encoding="utf-8",
        )
    # Close the fixture's WAL before copying it into isolated process roots.
    with sqlite3.connect(db) as conn:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    return db, captures


def cases():
    paths = {
        "settings": "/api/settings",
        "cars": "/api/cars/database",
        "language": "/api/languages/zh-tw",
        "sessions": "/api/analysis/sessions",
        "points": "/api/analysis/sessions/bench",
        "latest_points": "/api/analysis/data",
        "laps": "/api/analysis/sessions/bench/laps",
        "debrief": "/api/analysis/sessions/bench/debrief",
        "motec": "/api/analysis/export/motec/bench",
        "road_observations": "/api/road/engine-observations",
        "road_capture": "/api/road/engine-observations/obs-0/capture",
        "storage": "/api/settings/storage-overview",
        "analysis_status": "/api/analysis/status",
        "hud_config": "/api/overlay/config",
    }
    result = [(name, "GET", path, None) for name, path in paths.items()]
    tools = {
        "mcp_sessions": ("list_race_sessions", {"limit": 20, "offset": 900}),
        "mcp_summary": ("get_session_summary", {"session_id": "bench"}),
        "mcp_sparse": (
            "query_session_telemetry",
            {
                "session_id": "bench",
                "downsample": 60,
                "channels": ["time", "SpeedMetersPerSecond"],
            },
        ),
        "mcp_full": ("query_session_telemetry", {"session_id": "bench"}),
        "mcp_snapshot": ("get_live_telemetry_snapshot", {}),
        "capture_summary": ("get_capture_summary", {"capture_id": "capture-0"}),
        "capture_window": (
            "query_capture_window",
            {
                "capture_id": "capture-0",
                "max_samples": 100,
                "channels": ["timestampMs", "speedKmh"],
            },
        ),
    }
    for key, (name, args) in tools.items():
        result.append(
            (
                key,
                "POST",
                "/mcp",
                {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "tools/call",
                    "params": {"name": name, "arguments": args},
                },
            )
        )
    result.append(
        (
            "mcp_tools",
            "POST",
            "/mcp",
            {"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
        )
    )
    return result


def drag_fixture(connection, port, udp_port):
    request(connection, "POST", "/api/drag/prepare", {})
    packet = bytearray(324)
    struct.pack_into("<i", packet, 0, 1)
    struct.pack_into("<i", packet, 212, 42)
    struct.pack_into("<f", packet, 8, 8000)
    struct.pack_into("<f", packet, 16, 4200)
    packet[315], packet[319] = 255, 1
    with (
        socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp,
        connect(
            f"ws://127.0.0.1:{port}/ws/telemetry", proxy=None, open_timeout=5
        ) as ws,
    ):
        for i in range(1200):
            stamp = 1000 + i * 16
            struct.pack_into("<I", packet, 4, stamp)
            struct.pack_into("<f", packet, 256, i * 0.04)
            udp.sendto(packet, ("127.0.0.1", udp_port))
            while json.loads(ws.recv(timeout=5)).get("TimestampMS") != stamp:
                pass
    assert request(connection, "GET", "/api/drag/status")[1]["points_count"] == 1200


def timed_request(connection, method, path, body):
    encoded = json.dumps(body).encode() if body is not None else None
    start = time.perf_counter()
    connection.request(method, path, encoded, {"Content-Type": "application/json"})
    response = connection.getresponse()
    raw = response.read()
    elapsed = (time.perf_counter() - start) * 1000
    assert response.status == 200, (path, response.status, raw[:500])
    if "json" in response.getheader("Content-Type", ""):
        data = json.loads(raw)
        assert not isinstance(data, dict) or "error" not in data, (path, data)
    else:
        data = raw.decode("utf-8-sig")
    return elapsed, data, len(raw)


def normalized(outputs):
    """MCP text is JSON by contract; only capture paths vary by isolated root."""
    result = {}
    for name, data in outputs.items():
        if name == "storage":
            # Startup writes different version-specific settings/log files.
            # This is an observational timing, not an identical-workload ratio.
            continue
        if isinstance(data, dict) and "content" in data.get("result", {}):
            assert not data["result"].get("isError", False), data
            data = json.loads(data["result"]["content"][0]["text"])
        if name == "capture_summary":
            data["file_path"] = Path(data["file_path"]).name
        result[name] = data
    return result


def run_one(exe, kind, root, db, captures, language, requests):
    root.mkdir()
    (root / "lang").mkdir()
    (root / "lang" / "zh-tw.json").write_bytes(language)
    shutil.copy2(db, root / "telemetry_sessions.db")
    # v1.6 HTTP analysis uses sessions/, while its MCP service uses the root DB.
    # Rust unifies those paths. Both historical readers must see identical data.
    (root / "sessions").mkdir()
    shutil.copy2(db, root / "sessions" / "telemetry_sessions.db")
    shutil.copytree(captures, root / "captures")
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        probe.bind(("127.0.0.1", 0))
        udp_port = probe.getsockname()[1]
    args = [str(exe), "--data-dir", str(root)]
    if kind != "python":
        args += ["--port", "0"]
    with (root / "process.log").open("wb") as log:
        child = subprocess.Popen(
            args,
            cwd=root,
            stdin=subprocess.PIPE,
            stdout=log,
            stderr=log,
            env={**os.environ, "TELEMETRY_PORT": str(udp_port)},
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        connection = None
        try:
            deadline = time.monotonic() + 60
            ready = root / "logs" / "web_port.txt"
            while not ready.exists():
                assert child.poll() is None and time.monotonic() < deadline, root
                time.sleep(0.01)
            port = int(ready.read_text())
            connection = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
            measurements, outputs = {}, {}
            workloads = cases()
            for name, method, path, body in workloads:
                for _ in range(3):
                    timed_request(connection, method, path, body)
                values = []
                for _ in range(requests):
                    elapsed, data, length = timed_request(
                        connection, method, path, body
                    )
                    values.append(elapsed)
                measurements[name] = {**distribution(values), "response_bytes": length}
                outputs[name] = data
            # Seed live drag after MCP fallback measurements, which require no live frame.
            drag_fixture(connection, port, udp_port)
            for name in ("status", "data"):
                path = f"/api/drag/{name}"
                for _ in range(3):
                    timed_request(connection, "GET", path, None)
                values = []
                for _ in range(requests):
                    elapsed, data, length = timed_request(connection, "GET", path, None)
                    values.append(elapsed)
                measurements[f"drag_{name}"] = {
                    **distribution(values),
                    "response_bytes": length,
                }
                outputs[f"drag_{name}"] = data
            assert len(outputs["points"]) > 0 and len(outputs["sessions"]) == 1001
            assert len(outputs["road_observations"]) == 20
            (root / "responses.json").write_text(json.dumps(outputs), encoding="utf-8")
            return measurements
        finally:
            if connection:
                connection.close()
            child.stdin.close()
            try:
                child.wait(timeout=20)
                assert child.returncode == 0, (root, child.returncode)
            except subprocess.TimeoutExpired:
                subprocess.run(
                    ["taskkill", "/PID", str(child.pid), "/T", "/F"],
                    check=False,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                child.wait(timeout=10)
                raise AssertionError("Backend failed to stop on stdin EOF") from None


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--bundle", type=Path, required=True)
    p.add_argument("--before", type=Path, required=True)
    p.add_argument("--after", type=Path)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--rounds", type=int, default=5)
    p.add_argument("--requests", type=int, default=30)
    p.add_argument("--points", type=int, default=10000)
    args = p.parse_args()
    assert os.name == "nt" and min(args.rounds, args.requests, args.points) > 0
    output = args.output.resolve()
    work = output.parent / f"{output.stem}-runs"
    work.mkdir(parents=True, exist_ok=False)
    python = work / "python-v1.6-sidecar.exe"
    artifact = extract_sidecar(args.bundle.resolve(), python)
    db, captures = fixture(work, args.points)
    language = subprocess.check_output(
        ["git", "show", f"{BASELINE}:lang/zh-tw.json"], cwd=REPO
    )
    executables = {"python": python, "before": args.before.resolve()}
    if args.after:
        executables["after"] = args.after.resolve()
    result = {
        "host": platform.platform(),
        "baseline_commit": BASELINE,
        "artifact": artifact,
        "binaries": {key: sha(exe.read_bytes()) for key, exe in executables.items()},
        "fixture_db_sha256": sha(db.read_bytes()),
        "capture_sha256": {
            f.name: sha(f.read_bytes()) for f in captures.glob("*.json")
        },
        "method": {
            "points": args.points,
            "sessions": 1001,
            "road_documents": 20,
            "capture_files": 3,
            "drag_points": 1200,
            "rounds": args.rounds,
            "requests": args.requests,
            "warmups": 3,
            "timing": "HTTP keep-alive request through full response bytes, excluding client JSON decode; OS caches warm; fresh process/data root per round; reversed process order on odd rounds",
        },
        "runs": [],
    }
    expected = None
    for round_index in range(args.rounds):
        order = list(executables)
        if round_index % 2:
            order.reverse()
        for kind in order:
            print(f"round {round_index + 1}: {kind}", flush=True)
            measured = run_one(
                executables[kind],
                kind,
                work / f"{round_index}-{kind}",
                db,
                captures,
                language,
                args.requests,
            )
            outputs = json.loads(
                (work / f"{round_index}-{kind}" / "responses.json").read_text(
                    encoding="utf-8"
                )
            )
            actual = normalized(outputs)
            if expected is None:
                expected = actual
            differences = compare(expected, actual)
            assert not differences, (kind, differences[:10])
            result["runs"].append(
                {
                    "round": round_index,
                    "backend": kind,
                    "http_ms": measured,
                    "semantic_check": {
                        "equal_cases": len(actual),
                        "numeric_tolerance": "abs/rel 1e-6",
                        "motec": "exact CSV text including CRLF",
                        "excluded": ["storage: version-specific files/bytes"],
                        "normalized": [
                            "capture_summary.file_path: isolated root removed"
                        ],
                    },
                }
            )
            output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
