import { describe, expect, it } from "vitest";
import {
  calculateDistance3D,
  calculateLapsFromPoints,
  filterTrimmedPoints,
  isInsideSphere,
  isOutsideHysteresis,
  segmentIntersectsSphere,
  validateRoute,
} from "./routeTriggerMath";
import type { AnalysisDataPoint } from "../../context/TelemetryRecorderContext";

describe("routeTriggerMath", () => {
  describe("calculateDistance3D", () => {
    it("computes Euclidean distance in 3D space", () => {
      expect(calculateDistance3D(0, 0, 0, 3, 4, 0)).toBe(5);
      expect(calculateDistance3D(0, 0, 0, 1, 2, 2)).toBe(3);
    });
  });

  describe("isInsideSphere", () => {
    it("returns true when point is within radius", () => {
      expect(isInsideSphere(10, 10, 10, 10, 10, 10, 15)).toBe(true);
      expect(isInsideSphere(10, 20, 10, 10, 10, 10, 15)).toBe(true);
    });

    it("returns false when point is outside radius", () => {
      expect(isInsideSphere(30, 10, 10, 10, 10, 10, 15)).toBe(false);
    });
  });

  describe("isOutsideHysteresis", () => {
    it("applies 20% hysteresis buffer before reporting outside", () => {
      const radius = 10;
      // Distance is 11m: > 10m but <= 12m (1.2 * 10m)
      expect(isOutsideHysteresis(11, 0, 0, 0, 0, 0, radius, 1.2)).toBe(false);
      // Distance is 13m: > 12m
      expect(isOutsideHysteresis(13, 0, 0, 0, 0, 0, radius, 1.2)).toBe(true);
    });
  });

  describe("segmentIntersectsSphere", () => {
    it("detects high-speed swept gate crossings where both endpoints are outside the sphere", () => {
      // Gate at origin (0, 0, 0) with radius 5.0m
      // Car jumps from -10m to +10m in one frame (swept directly through sphere)
      expect(segmentIntersectsSphere([-10, 0, 0], [10, 0, 0], [0, 0, 0], 5)).toBe(true);
      // Car passes 20m away from sphere
      expect(segmentIntersectsSphere([-10, 20, 0], [10, 20, 0], [0, 0, 0], 5)).toBe(false);
      // Car stopped before sphere
      expect(segmentIntersectsSphere([-20, 0, 0], [-10, 0, 0], [0, 0, 0], 5)).toBe(false);
    });
  });

  describe("validateRoute", () => {
    it("validates valid time_trial route", () => {
      const valid = validateRoute({
        name: "Test Route",
        mode: "time_trial",
        start_x: 10,
        start_y: 20,
        start_z: 30,
        start_radius: 15,
      });
      expect(valid.valid).toBe(true);
    });

    it("rejects route without name or invalid mode", () => {
      expect(validateRoute({ name: "", mode: "time_trial" }).valid).toBe(false);
      expect(validateRoute({ name: "A", mode: "invalid" as any }).valid).toBe(false);
    });

    it("validates roaming route requiring end coordinates", () => {
      expect(
        validateRoute({
          name: "Roam Route",
          mode: "roaming",
          start_x: 0,
          start_y: 0,
          start_z: 0,
          start_radius: 15,
        }).valid,
      ).toBe(false);

      expect(
        validateRoute({
          name: "Roam Route",
          mode: "roaming",
          start_x: 0,
          start_y: 0,
          start_z: 0,
          start_radius: 15,
          end_x: 100,
          end_y: 0,
          end_z: 100,
          end_radius: 15,
        }).valid,
      ).toBe(true);
    });
  });

  describe("filterTrimmedPoints", () => {
    it("filters points between valid start and end times", () => {
      const points: Partial<AnalysisDataPoint>[] = [
        { time: 0 },
        { time: 1 },
        { time: 2 },
        { time: 3 },
        { time: 4 },
        { time: 5 },
      ];
      const filtered = filterTrimmedPoints(points as AnalysisDataPoint[], 1.0, 4.0);
      expect(filtered.map((p) => p.time)).toEqual([1, 2, 3, 4]);
    });
  });

  describe("calculateLapsFromPoints", () => {
    it("extracts laps from multi-lap points array", () => {
      const points: Partial<AnalysisDataPoint>[] = [
        { time: 0, LapNumber: 1, SpeedMetersPerSecond: 20, lap_distance: 0 },
        { time: 10, LapNumber: 1, SpeedMetersPerSecond: 30, lap_distance: 200 },
        { time: 20, LapNumber: 1, SpeedMetersPerSecond: 25, lap_distance: 400 },
        { time: 25, LapNumber: 2, SpeedMetersPerSecond: 22, lap_distance: 0 },
        { time: 35, LapNumber: 2, SpeedMetersPerSecond: 32, lap_distance: 210 },
        { time: 45, LapNumber: 2, SpeedMetersPerSecond: 28, lap_distance: 420 },
      ];

      const laps = calculateLapsFromPoints(points as AnalysisDataPoint[]);
      expect(laps.length).toBe(2);
      expect(laps[0].lap_number).toBe(1);
      expect(laps[0].lap_time).toBe(20);
      expect(laps[0].complete).toBe(true);
      expect(laps[1].lap_number).toBe(2);
      expect(laps[1].lap_time).toBe(20);
      expect(laps[1].complete).toBe(true);
    });

    it("handles empty points safely", () => {
      expect(calculateLapsFromPoints([])).toEqual([]);
    });
  });
});
