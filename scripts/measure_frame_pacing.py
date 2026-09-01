#!/usr/bin/env python3
"""measure_frame_pacing.py

Automated diagnostic and data collection tool for HUD Overlay frame pacing.
Collects telemetry packet intervals, calculates frame jitter statistics (Min/Max/Mean/P95/P99),
and generates A/B comparison reports between raw 60Hz and smoothed high-refresh rendering.
"""

import argparse
import asyncio
import json
import logging
import math
import sys
import time
from typing import Any, Dict, List

import websockets

logger = logging.getLogger(__name__)


def calculate_pacing_metrics(
    intervals_ms: List[float],
    target_fps: float = 60.0,
) -> Dict[str, Any]:
    """Calculate statistical frame pacing metrics from a sequence of intervals (ms)."""
    if not intervals_ms:
        return {
            "samplesCount": 0,
            "avgIntervalMs": 0.0,
            "minIntervalMs": 0.0,
            "maxIntervalMs": 0.0,
            "p95IntervalMs": 0.0,
            "p99IntervalMs": 0.0,
            "jitterStdDevMs": 0.0,
            "targetIntervalMs": 1000.0 / target_fps if target_fps > 0 else 16.667,
            "estimatedFps": 0.0,
            "frameDropRatio": 0.0,
        }

    n = len(intervals_ms)
    avg_interval = sum(intervals_ms) / n
    min_interval = min(intervals_ms)
    max_interval = max(intervals_ms)

    sorted_intervals = sorted(intervals_ms)
    idx_p95 = min(n - 1, math.floor(n * 0.95))
    idx_p99 = min(n - 1, math.floor(n * 0.99))
    p95_interval = sorted_intervals[idx_p95]
    p99_interval = sorted_intervals[idx_p99]

    # Standard deviation (Jitter)
    variance = sum((x - avg_interval) ** 2 for x in intervals_ms) / n
    std_dev = math.sqrt(variance)

    target_interval = 1000.0 / target_fps if target_fps > 0 else 16.667
    estimated_fps = 1000.0 / avg_interval if avg_interval > 0 else 0.0

    # Frames with interval > 1.8x target interval are considered dropped/stutter
    dropped_frames = sum(1 for x in intervals_ms if x > target_interval * 1.8)
    frame_drop_ratio = dropped_frames / n if n > 0 else 0.0

    return {
        "samplesCount": n,
        "avgIntervalMs": round(avg_interval, 3),
        "minIntervalMs": round(min_interval, 3),
        "maxIntervalMs": round(max_interval, 3),
        "p95IntervalMs": round(p95_interval, 3),
        "p99IntervalMs": round(p99_interval, 3),
        "jitterStdDevMs": round(std_dev, 3),
        "targetIntervalMs": round(target_interval, 3),
        "estimatedFps": round(estimated_fps, 2),
        "frameDropRatio": round(frame_drop_ratio, 4),
    }


async def collect_websocket_samples(
    uri: str,
    duration_secs: float,
) -> List[float]:
    """Connect to HorizonTuner telemetry WebSocket and record arrival intervals (ms)."""
    intervals: List[float] = []
    logger.info(f"Connecting to telemetry WebSocket at {uri} for {duration_secs}s...")

    try:
        async with websockets.connect(uri) as ws:
            start_time = time.monotonic()
            last_msg_time = time.monotonic()

            while time.monotonic() - start_time < duration_secs:
                try:
                    await asyncio.wait_for(ws.recv(), timeout=1.0)
                    now = time.monotonic()
                    interval_ms = (now - last_msg_time) * 1000.0
                    intervals.append(interval_ms)
                    last_msg_time = now
                except asyncio.TimeoutError:
                    continue
    except Exception as e:
        logger.error(f"WebSocket connection failed: {e}")

    # Remove the first sample interval as it represents connection handshake duration
    if len(intervals) > 1:
        intervals = intervals[1:]

    return intervals


def main():
    parser = argparse.ArgumentParser(
        description="HorizonTuner Frame Pacing & Telemetry Diagnostic Collector"
    )
    parser.add_argument(
        "--host", default="127.0.0.1", help="Backend host (default: 127.0.0.1)"
    )
    parser.add_argument(
        "--port", type=int, default=8001, help="Backend HTTP port (default: 8001)"
    )
    parser.add_argument(
        "--duration", type=float, default=5.0, help="Sampling duration in seconds"
    )
    parser.add_argument(
        "--target-fps",
        type=float,
        default=60.0,
        help="Target FPS baseline (default: 60.0)",
    )
    parser.add_argument(
        "--label", default="Default_Test", help="Label for this benchmark run"
    )
    parser.add_argument(
        "--output", default=None, help="Path to save JSON metrics report"
    )

    args = parser.parse_args()

    uri = f"ws://{args.host}:{args.port}/ws/telemetry"
    intervals = asyncio.run(collect_websocket_samples(uri, args.duration))

    metrics = calculate_pacing_metrics(intervals, target_fps=args.target_fps)
    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "label": args.label,
        "uri": uri,
        "durationSecs": args.duration,
        "metrics": metrics,
    }

    print(json.dumps(report, indent=2))

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        print(f"\n[+] Saved pacing diagnostic report to {args.output}")


if __name__ == "__main__":
    main()
