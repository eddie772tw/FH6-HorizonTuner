const fs = require('fs');

function evaluateCustomMath(expr, ctx) {
  return ctx.Speed * 2;
}

const sampleData = Array.from({length: 10000}, (_, i) => ({
  Gear: 1, SpeedMetersPerSecond: 10 + i%10, CurrentEngineRpm: 5000,
  AccelInput: 255, BrakeInput: 0, SteerInput: 127, AccelerationX: 1.5,
  AccelerationZ: -1.0, SuspTravel: [0.5, 0.5], TireTemp: [100, 100]
}));

function testOriginal() {
  const start = performance.now();
  let sum = 0;
  for (let iter = 0; iter < 100; iter++) {
    for (let i = 0; i < sampleData.length; i++) {
      const p = sampleData[i];
      const mathCtx = {
        Speed: p.SpeedMetersPerSecond * 3.6,
        SpeedMetersPerSecond: p.SpeedMetersPerSecond,
        CompareSpeed: p.SpeedMetersPerSecond * 3.6 * 0.95,
        SpeedDelta: p.SpeedMetersPerSecond * 3.6 * 0.05,
        RPM: p.CurrentEngineRpm,
        CurrentEngineRpm: p.CurrentEngineRpm,
        Gear: p.Gear,
        Throttle: (p.AccelInput / 255) * 100,
        Brake: (p.BrakeInput / 255) * 100,
        AccelInput: p.AccelInput,
        BrakeInput: p.BrakeInput,
        Steer: (((p).SteerInput ?? 0) / 127) * 100,
        LatG: p.AccelerationX / 9.81,
        LonG: p.AccelerationZ / 9.81,
        AccelerationX: p.AccelerationX,
        AccelerationZ: p.AccelerationZ,
        Susp_FL: p.SuspTravel[0] * 100,
        Susp_FR: p.SuspTravel[1] * 100,
        Temp_FL: ((p.TireTemp[0] - 32) * 5) / 9,
        Temp_FR: ((p.TireTemp[1] - 32) * 5) / 9,
      };
      sum += evaluateCustomMath("Speed * 2", mathCtx);
    }
  }
  console.log("Original:", performance.now() - start, "ms");
  return sum;
}

function testOptimized() {
  const start = performance.now();
  let sum = 0;
  const mathCtx = {};
  for (let iter = 0; iter < 100; iter++) {
    for (let i = 0; i < sampleData.length; i++) {
      const p = sampleData[i];
      mathCtx.Speed = p.SpeedMetersPerSecond * 3.6;
      mathCtx.SpeedMetersPerSecond = p.SpeedMetersPerSecond;
      mathCtx.CompareSpeed = p.SpeedMetersPerSecond * 3.6 * 0.95;
      mathCtx.SpeedDelta = p.SpeedMetersPerSecond * 3.6 * 0.05;
      mathCtx.RPM = p.CurrentEngineRpm;
      mathCtx.CurrentEngineRpm = p.CurrentEngineRpm;
      mathCtx.Gear = p.Gear;
      mathCtx.Throttle = (p.AccelInput / 255) * 100;
      mathCtx.Brake = (p.BrakeInput / 255) * 100;
      mathCtx.AccelInput = p.AccelInput;
      mathCtx.BrakeInput = p.BrakeInput;
      mathCtx.Steer = (((p).SteerInput ?? 0) / 127) * 100;
      mathCtx.LatG = p.AccelerationX / 9.81;
      mathCtx.LonG = p.AccelerationZ / 9.81;
      mathCtx.AccelerationX = p.AccelerationX;
      mathCtx.AccelerationZ = p.AccelerationZ;
      mathCtx.Susp_FL = p.SuspTravel[0] * 100;
      mathCtx.Susp_FR = p.SuspTravel[1] * 100;
      mathCtx.Temp_FL = ((p.TireTemp[0] - 32) * 5) / 9;
      mathCtx.Temp_FR = ((p.TireTemp[1] - 32) * 5) / 9;
      sum += evaluateCustomMath("Speed * 2", mathCtx);
    }
  }
  console.log("Optimized:", performance.now() - start, "ms");
  return sum;
}

testOriginal();
testOptimized();
