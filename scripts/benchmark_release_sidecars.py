"""Opt-in Windows release sidecar comparison; never launches the frontend.

Requires the v1.6 portable bundle and a locally built Rust release sidecar.
Only the stdlib and the repository's existing websockets dependency are used.
"""

import argparse
import hashlib
import http.client
import json
import math
import os
import platform
import socket
import statistics
import struct
import subprocess
import threading
import time
import zipfile
from pathlib import Path

from websockets.sync.client import connect

BASELINE = "cd96d86f017fa43f4f3d429155a08aa77dc74bac"
BUNDLE_SHA = "d2bd59f59be411499db86fc0857dd5ae9c970773ba66c1259ce7f97bf4eb69aa"
PORTABLE_SHA = "e40e254629a1ce56188e718eb12204f6cc16d62a271510767698b1ab276d28ae"
REPO = Path(__file__).resolve().parents[1]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def extract_sidecar(bundle, output):
    """Extract the unchanged include_bytes payload without executing Tauri."""
    assert sha(bundle.read_bytes()) == BUNDLE_SHA, "Unexpected v1.6 bundle"
    with zipfile.ZipFile(bundle) as archive:
        portable = archive.read("FH6-HorizonTuner-Full-Portable.exe")
    assert sha(portable) == PORTABLE_SHA, "Unexpected portable executable"
    magic = b"MEI" + bytes([12, 11, 10, 11, 14])
    cookie = portable.find(magic)
    assert cookie > 0 and portable.find(magic, cookie + 1) == -1
    _, size, toc, toc_size, version, dll = struct.unpack(
        "!8sIIII64s", portable[cookie : cookie + 88]
    )
    package = cookie + 88 - size
    assert version == 313 and dll.rstrip(b"\0") == b"python313.dll"
    assert package + toc + toc_size == cookie
    candidates = []
    start = portable.find(b"MZ", 1)
    while 0 < start < package:
        pe = start + int.from_bytes(portable[start + 60 : start + 64], "little")
        if portable[pe : pe + 4] == b"PE\0\0":
            candidates.append(start)
        start = portable.find(b"MZ", start + 2)
    assert len(candidates) == 1, candidates
    start = candidates[0]
    payload = portable[start : cookie + 88]
    output.write_bytes(payload)
    return {
        "bundle_sha256": BUNDLE_SHA,
        "portable_sha256": PORTABLE_SHA,
        "embedded_offset": start,
        "embedded_length": len(payload),
        "sidecar_sha256": sha(payload),
        "embedded_python": "3.13",
    }


def distribution(values):
    ordered = sorted(values)
    return {
        "median": statistics.median(values),
        "p95": ordered[math.ceil(len(values) * 0.95) - 1],
        "min": ordered[0],
        "max": ordered[-1],
        "samples": values,
    }


def request(connection, method, path, body=None):
    encoded = json.dumps(body).encode() if body is not None else None
    started = time.perf_counter()
    connection.request(method, path, encoded, {"Content-Type": "application/json"})
    response = connection.getresponse()
    raw = response.read()
    elapsed = (time.perf_counter() - started) * 1000
    assert response.status == 200, (path, response.status, raw)
    return elapsed, json.loads(raw), len(raw)


def process_memory(process_id):
    # This release has a bootloader and one direct worker (both saved in results).
    command = (
        f"$ids = @({process_id}); "
        f"$ids += @(Get-CimInstance Win32_Process -Filter 'ParentProcessId={process_id}' | "
        "Select-Object -ExpandProperty ProcessId); "
        "@(Get-Process -Id $ids | Select-Object Id,WorkingSet64,PrivateMemorySize64) | "
        "ConvertTo-Json -Compress"
    )
    raw = subprocess.check_output(
        ["powershell", "-NoProfile", "-Command", command],
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    rows = json.loads(raw)
    if isinstance(rows, dict):
        rows = [rows]
    return {
        "processes": rows,
        "working_set_bytes": sum(row["WorkingSet64"] for row in rows),
        "private_bytes": sum(row["PrivateMemorySize64"] for row in rows),
    }


def udp_probe(port, udp_port, count):
    packet = bytearray(324)
    struct.pack_into("<i", packet, 0, 1)
    for offset, value in [(8, 8000.0), (16, 4200.0), (256, 20.0), (260, 120000.0)]:
        struct.pack_into("<f", packet, offset, value)
    struct.pack_into("<i", packet, 212, 42)
    packet[315], packet[319] = 255, 3
    samples = []
    with (
        socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sender,
        connect(
            f"ws://127.0.0.1:{port}/ws/telemetry", proxy=None, open_timeout=5
        ) as ws,
    ):
        for i in range(count + 10):
            stamp = 1000 + i * 17
            struct.pack_into("<I", packet, 4, stamp)
            started = time.perf_counter()
            sender.sendto(packet, ("127.0.0.1", udp_port))
            while True:
                frame = json.loads(ws.recv(timeout=3))
                if frame.get("TimestampMS") == stamp:
                    break
            elapsed = time.perf_counter() - started
            assert frame["CarOrdinal"] == 42 and frame["SpeedMetersPerSecond"] == 20
            if i >= 10:
                samples.append(elapsed * 1000)
            time.sleep(max(0, 1 / 60 - elapsed))
    return distribution(samples)


def udp_stream_probe(port, udp_port, seconds):
    """Send at fixed deadlines independently of receiving; preserve every sample."""
    count = seconds * 60
    sent = {}
    received = {}
    lateness = []
    pipeline_samples = []
    failures = []
    stopped = threading.Event()
    epoch = time.perf_counter() + 0.2

    def transmit():
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sender:
                packet = bytearray(324)
                struct.pack_into("<i", packet, 0, 1)
                for offset, value in [
                    (8, 8000.0),
                    (16, 4200.0),
                    (256, 20.0),
                    (260, 120000.0),
                ]:
                    struct.pack_into("<f", packet, offset, value)
                struct.pack_into("<i", packet, 212, 42)
                packet[315], packet[319] = 255, 3
                for i in range(count):
                    deadline = epoch + i / 60
                    time.sleep(max(0, deadline - time.perf_counter()))
                    stamp = 10000 + i * 17
                    struct.pack_into("<I", packet, 4, stamp)
                    struct.pack_into("<f", packet, 304, 10 + i / 60)
                    now = time.perf_counter()
                    sent[stamp] = now
                    lateness.append((now - deadline) * 1000)
                    sender.sendto(packet, ("127.0.0.1", udp_port))
        except Exception as error:
            failures.append(str(error))

    def observe():
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        try:
            while not stopped.is_set():
                _, value, _ = request(
                    connection, "GET", "/api/diagnostics/telemetry-pipeline"
                )
                pipeline_samples.append(
                    {"seconds": time.perf_counter() - epoch, "pipeline": value}
                )
                stopped.wait(0.2)
        except Exception as error:
            failures.append(str(error))
        finally:
            connection.close()

    with connect(
        f"ws://127.0.0.1:{port}/ws/telemetry", proxy=None, open_timeout=5
    ) as ws:
        sender = threading.Thread(target=transmit)
        monitor = threading.Thread(target=observe)
        sender.start()
        monitor.start()
        try:
            while len(received) < count and time.perf_counter() < epoch + seconds + 5:
                try:
                    frame = json.loads(ws.recv(timeout=1))
                except TimeoutError:
                    continue
                stamp = frame.get("TimestampMS")
                if stamp in sent:
                    assert (
                        frame["CarOrdinal"] == 42
                        and frame["SpeedMetersPerSecond"] == 20
                    )
                    received[stamp] = (time.perf_counter() - sent[stamp]) * 1000
        finally:
            stopped.set()
            sender.join(timeout=seconds + 5)
            monitor.join(timeout=6)
            assert not sender.is_alive() and not monitor.is_alive()
    assert not failures, failures
    ordered = [received[stamp] for stamp in sorted(received)]
    assert ordered, "No telemetry received"
    third = max(1, len(ordered) // 3)
    return {
        **distribution(ordered),
        "sent": len(sent),
        "received": len(received),
        "missing_timestamps": sorted(sent.keys() - received.keys()),
        "first_third_median_ms": statistics.median(ordered[:third]),
        "last_third_median_ms": statistics.median(ordered[-third:]),
        "sender_lateness_ms": distribution(lateness),
        "sender_span_seconds": max(sent.values()) - min(sent.values()),
        "pipeline_samples": pipeline_samples,
    }


def run_one(
    executable, kind, root, language, requests, frames, stream_seconds=0, record=False
):
    root.mkdir(parents=True)
    (root / "lang").mkdir()
    (root / "lang" / "zh-tw.json").write_bytes(language)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        probe.bind(("127.0.0.1", 0))
        udp_port = probe.getsockname()[1]
    arguments = [str(executable), "--data-dir", str(root)]
    if kind == "rust":
        arguments += ["--port", "0"]
    with (root / "process.log").open("wb") as log:
        started = time.perf_counter()
        child = subprocess.Popen(
            arguments,
            cwd=root,
            env={**os.environ, "TELEMETRY_PORT": str(udp_port)},
            stdin=subprocess.PIPE,
            stdout=log,
            stderr=log,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        try:
            port_file = root / "logs" / "web_port.txt"
            while not port_file.exists():
                assert child.poll() is None, f"Backend exited: {root}"
                assert time.perf_counter() - started < 60, f"Readiness timeout: {root}"
                time.sleep(0.005)
            port = int(port_file.read_text())
            connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            _, settings, _ = request(connection, "GET", "/api/settings")
            startup = (time.perf_counter() - started) * 1000
            assert settings["mcp_enabled"] is True
            time.sleep(1)
            memory = process_memory(child.pid)
            http_results = {}
            cases = [
                ("settings", "GET", "/api/settings", None),
                ("language", "GET", "/api/languages/zh-tw", None),
                (
                    "mcp_initialize",
                    "POST",
                    "/mcp",
                    {
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "initialize",
                        "params": {
                            "protocolVersion": "2024-11-05",
                            "capabilities": {},
                            "clientInfo": {"name": "release-benchmark", "version": "1"},
                        },
                    },
                ),
            ]
            for name, method, path, body in cases:
                for _ in range(10):
                    request(connection, method, path, body)
                samples = []
                for _ in range(requests):
                    elapsed, payload, length = request(connection, method, path, body)
                    if name == "language":
                        assert payload == json.loads(language)
                    if name == "mcp_initialize":
                        assert payload["result"]["protocolVersion"] == "2024-11-05"
                    samples.append(elapsed)
                http_results[name] = {**distribution(samples), "response_bytes": length}
            if stream_seconds:
                udp_probe(
                    port, udp_port, 10
                )  # 20 priming frames establish car context.
                if record:
                    request(connection, "POST", "/api/analysis/recorder/start", {})
                udp = udp_stream_probe(port, udp_port, stream_seconds)
                (root / "stream.json").write_text(
                    json.dumps(udp, indent=2), encoding="utf-8"
                )
                # Uvicorn may close this idle HTTP connection during the stream.
                connection.close()
                connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                if record:
                    request(connection, "POST", "/api/analysis/recorder/stop", {})
                assert not udp["missing_timestamps"], udp["missing_timestamps"]
                expected_frames = stream_seconds * 60 + 20
            else:
                udp = udp_probe(port, udp_port, frames)
                expected_frames = frames + 10
            _, pipeline, _ = request(
                connection, "GET", "/api/diagnostics/telemetry-pipeline"
            )
            assert pipeline["framesProcessed"] == expected_frames
            assert pipeline["framesDropped"] == 0
            connection.close()
            return {
                "startup_ready_ms": startup,
                "idle_memory": memory,
                "http_ms": http_results,
                "udp_to_json_ws_ms": udp,
                "pipeline": pipeline,
                "http_port": port,
                "udp_port": udp_port,
            }
        finally:
            child.stdin.close()
            try:
                child.wait(timeout=15)
                assert child.returncode == 0, ("Backend exit code", child.returncode)
            except subprocess.TimeoutExpired:
                subprocess.run(
                    ["taskkill", "/PID", str(child.pid), "/T", "/F"],
                    check=False,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                child.wait(timeout=10)
                raise AssertionError("Backend did not stop on stdin EOF") from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--rust", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--rounds", type=int, default=7)
    parser.add_argument("--requests", type=int, default=100)
    parser.add_argument("--frames", type=int, default=120)
    parser.add_argument("--stream-seconds", type=int, default=0)
    parser.add_argument("--record", action="store_true")
    args = parser.parse_args()
    assert os.name == "nt", "This comparison targets Windows release artifacts"
    assert min(args.rounds, args.requests, args.frames) > 0
    assert args.stream_seconds >= 0 and (not args.record or args.stream_seconds)
    output = args.output.resolve()
    work = output.parent / (output.stem + "-runs")
    work.mkdir(parents=True, exist_ok=False)
    python = work / "python-v1.6-sidecar.exe"
    artifact = extract_sidecar(args.bundle.resolve(), python)
    language = subprocess.check_output(
        ["git", "show", f"{BASELINE}:lang/zh-tw.json"], cwd=REPO
    )
    rust = args.rust.resolve()
    result = {
        "baseline_tag": "v1.6",
        "baseline_commit": BASELINE,
        "rust_checkout_head_sha": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=REPO, text=True
        ).strip(),
        "artifact": artifact,
        "rust_sha256": sha(rust.read_bytes()),
        "language_sha256": sha(language),
        "host": platform.platform(),
        "method": {
            "rounds": args.rounds,
            "http_requests_per_case": args.requests,
            "warmup_requests": 10,
            "udp_frames": args.stream_seconds * 60
            if args.stream_seconds
            else args.frames,
            "udp_warmup": 20 if args.stream_seconds else 10,
            "udp_mode": "independent fixed deadlines"
            if args.stream_seconds
            else "sequential send/receive",
            "target_hz": 60,
            "stream_seconds": args.stream_seconds,
            "recording": args.record,
            "transport": "HTTP/1.1 keep-alive, one in-flight",
            "startup": "Popen through readiness file and first HTTP 200, fresh data dir; OS caches not cleared",
            "memory": "sum bootloader and worker after 1s idle, no overlay subscribers",
            "order": "alternating Python/Rust then Rust/Python",
        },
        "runs": [],
    }
    for index in range(args.rounds):
        order = ["python", "rust"] if index % 2 == 0 else ["rust", "python"]
        for kind in order:
            print(f"Round {index + 1}/{args.rounds}: {kind}", flush=True)
            measured = run_one(
                python if kind == "python" else rust,
                kind,
                work / f"{index}-{kind}",
                language,
                args.requests,
                args.frames,
                args.stream_seconds,
                args.record,
            )
            result["runs"].append({"round": index, "backend": kind, **measured})
            output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
