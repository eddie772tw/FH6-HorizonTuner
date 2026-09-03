import { describe, it, expect } from "vitest";
import { calculateFrontendDebrief, RawTelemetryPoint } from "./sessionDebriefMath";

describe("sessionDebriefMath pure calculations", () => {
  it("returns default zero data for empty point list", () => {
    const debrief = calculateFrontendDebrief([]);
    expect(debrief.total_samples).toBe(0);
    expect(debrief.valid_laps).toBe(0);
    expect(debrief.tire_thermals.status).toBe("no_data");
    expect(debrief.suspension.status).toBe("no_data");
    expect(debrief.handling_balance.tendency).toBe("Neutral / Balanced");
  });

  it("identifies optimal condition for normal temperatures and suspension", () => {
    const mockPoints: RawTelemetryPoint[] = Array.from({ length: 30 }, (_, i) => ({
      LapNumber: 1,
      SpeedMetersPerSecond: 30,
      AccelerationX: 0,
      TireTemp: [185, 185, 185, 185], // ~85°C
      SuspTravel: [0.4, 0.4, 0.45, 0.45],
      TireSlipAngle: [0.05, 0.05, 0.05, 0.05],
    }));

    const debrief = calculateFrontendDebrief(mockPoints);
    expect(debrief.total_samples).toBe(30);
    expect(debrief.valid_laps).toBe(1);
    expect(debrief.tire_thermals.status).toBe("Optimal");
    expect(debrief.suspension.bottom_out_count).toBe(0);
    expect(debrief.suspension.status).toBe("Optimal");
    expect(debrief.handling_balance.tendency).toBe("Neutral / Balanced");
  });

  it("identifies bottoming and understeer bias correctly", () => {
    const mockPoints: RawTelemetryPoint[] = Array.from({ length: 20 }, (_, i) => ({
      LapNumber: 2,
      SpeedMetersPerSecond: 35,
      AccelerationX: 4.5, // > 0.3G cornering
      TireTemp: [240, 240, 240, 240], // ~115°C Overheating
      SuspTravel: [0.98, 0.98, 0.5, 0.5], // Bottoming
      TireSlipAngle: [0.20, 0.20, 0.05, 0.05], // Front slip >> Rear slip
    }));

    const debrief = calculateFrontendDebrief(mockPoints);
    expect(debrief.tire_thermals.status).toBe("Overheating");
    expect(debrief.suspension.bottom_out_count).toBeGreaterThan(10);
    expect(debrief.suspension.status).toBe("Severe Bottoming");
    expect(debrief.handling_balance.understeer_pct).toBeGreaterThan(70);
    expect(debrief.handling_balance.tendency).toBe("Understeer Biased");
  });

  it("converts midrange Fahrenheit correctly and reports Cold status", () => {
    const mockPoints: RawTelemetryPoint[] = [
      {
        TireTemp: [140.0, 140.0, 140.0, 140.0],
        SuspTravel: [0.0, 0.0, 0.0, 0.0],
      },
    ];
    const debrief = calculateFrontendDebrief(mockPoints);
    expect(debrief.tire_thermals.fl_avg).toBeCloseTo(60.0, 1);
    expect(debrief.tire_thermals.status).toBe("Cold");
  });
});