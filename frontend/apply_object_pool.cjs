const fs = require('fs');

const path = 'd:/FH6-HorizonTuner/frontend/src/components/TelemetryView.tsx';
let content = fs.readFileSync(path, 'utf8');

// The original useEffect code is:
/*
  useEffect(() => {
    if (!data) return;
    
    // Proactive memory cleanup on race state changes (soft cleanup)
    if (data.IsRaceOn !== lastIsRaceOnRef.current) {
      historyG.current = [];
      historySusp.current = [];
      historyTire.current = [];
      lastIsRaceOnRef.current = data.IsRaceOn;
    }

    // We only track when racing to avoid clutter when paused/in menus
    if (data.IsRaceOn !== 1) return;

    const now = performance.now();
    const dt = now - lastTimeRef.current;
    lastTimeRef.current = now;

    const lat = (data.AccelerationX || 0) / 9.81;
    const lon = (data.AccelerationZ || 0) / 9.81;
    const speed = data.SpeedMetersPerSecond || 0;
    const isMoving = Math.abs(speed) >= 0.5;
    
    historyG.current.push({ lat, lon, time: now });
    while (historyG.current.length > 0 && now - historyG.current[0].time > 30000) historyG.current.shift();

    const suspTravel = data.NormalizedSuspensionTravel || [0, 0, 0, 0];
    if (!isMoving) {
      for (let i = 0; i < historySusp.current.length; i++) historySusp.current[i].time += dt;
    } else {
      historySusp.current.push({ FL: suspTravel[0], FR: suspTravel[1], RL: suspTravel[2], RR: suspTravel[3], time: now });
      while (historySusp.current.length > 0 && now - historySusp.current[0].time > 30000) historySusp.current.shift();
    }

    const tireTemp = data.TireTemp || [0,0,0,0];
    const slipRatio = data.TireSlipRatio || [0,0,0,0];
    const slipAngle = data.TireSlipAngle || [0,0,0,0];

    if (!isMoving) {
      for (let i = 0; i < historyTire.current.length; i++) historyTire.current[i].time += dt;
    } else {
      historyTire.current.push({
        FL: { temp: tireTemp[0], ratio: slipRatio[0], angle: slipAngle[0] },
        FR: { temp: tireTemp[1], ratio: slipRatio[1], angle: slipAngle[1] },
        RL: { temp: tireTemp[2], ratio: slipRatio[2], angle: slipAngle[2] },
        RR: { temp: tireTemp[3], ratio: slipRatio[3], angle: slipAngle[3] },
        time: now,
        speed: speed
      });
      while (historyTire.current.length > 0 && now - historyTire.current[0].time > 30000) historyTire.current.shift();
    }
  }, [data]);
*/

const search = `    historyG.current.push({ lat, lon, time: now });
    while (historyG.current.length > 0 && now - historyG.current[0].time > 30000) historyG.current.shift();

    const suspTravel = data.NormalizedSuspensionTravel || [0, 0, 0, 0];
    if (!isMoving) {
      for (let i = 0; i < historySusp.current.length; i++) historySusp.current[i].time += dt;
    } else {
      historySusp.current.push({ FL: suspTravel[0], FR: suspTravel[1], RL: suspTravel[2], RR: suspTravel[3], time: now });
      while (historySusp.current.length > 0 && now - historySusp.current[0].time > 30000) historySusp.current.shift();
    }

    const tireTemp = data.TireTemp || [0,0,0,0];
    const slipRatio = data.TireSlipRatio || [0,0,0,0];
    const slipAngle = data.TireSlipAngle || [0,0,0,0];

    if (!isMoving) {
      for (let i = 0; i < historyTire.current.length; i++) historyTire.current[i].time += dt;
    } else {
      historyTire.current.push({
        FL: { temp: tireTemp[0], ratio: slipRatio[0], angle: slipAngle[0] },
        FR: { temp: tireTemp[1], ratio: slipRatio[1], angle: slipAngle[1] },
        RL: { temp: tireTemp[2], ratio: slipRatio[2], angle: slipAngle[2] },
        RR: { temp: tireTemp[3], ratio: slipRatio[3], angle: slipAngle[3] },
        time: now,
        speed: speed
      });
      while (historyTire.current.length > 0 && now - historyTire.current[0].time > 30000) historyTire.current.shift();
    }`;

const replace = `    // --- Zero-Allocation Object Pool (Ring Buffer alternative) ---
    // Instead of creating new objects every frame, we reuse the oldest objects
    const MAX_HISTORY = 900; // 30 seconds at 30 FPS

    if (historyG.current.length < MAX_HISTORY) {
      historyG.current.push({ lat, lon, time: now });
    } else {
      const old = historyG.current.shift();
      if (old) {
        old.lat = lat; old.lon = lon; old.time = now;
        historyG.current.push(old);
      }
    }

    const suspTravel = data.NormalizedSuspensionTravel || [0, 0, 0, 0];
    if (!isMoving) {
      for (let i = 0; i < historySusp.current.length; i++) historySusp.current[i].time += dt;
    } else {
      if (historySusp.current.length < MAX_HISTORY) {
        historySusp.current.push({ FL: suspTravel[0], FR: suspTravel[1], RL: suspTravel[2], RR: suspTravel[3], time: now });
      } else {
        const old = historySusp.current.shift();
        if (old) {
          old.FL = suspTravel[0]; old.FR = suspTravel[1]; old.RL = suspTravel[2]; old.RR = suspTravel[3]; old.time = now;
          historySusp.current.push(old);
        }
      }
    }

    const tireTemp = data.TireTemp || [0,0,0,0];
    const slipRatio = data.TireSlipRatio || [0,0,0,0];
    const slipAngle = data.TireSlipAngle || [0,0,0,0];

    if (!isMoving) {
      for (let i = 0; i < historyTire.current.length; i++) historyTire.current[i].time += dt;
    } else {
      if (historyTire.current.length < MAX_HISTORY) {
        historyTire.current.push({
          FL: { temp: tireTemp[0], ratio: slipRatio[0], angle: slipAngle[0] },
          FR: { temp: tireTemp[1], ratio: slipRatio[1], angle: slipAngle[1] },
          RL: { temp: tireTemp[2], ratio: slipRatio[2], angle: slipAngle[2] },
          RR: { temp: tireTemp[3], ratio: slipRatio[3], angle: slipAngle[3] },
          time: now,
          speed: speed
        });
      } else {
        const old = historyTire.current.shift();
        if (old) {
          old.FL.temp = tireTemp[0]; old.FL.ratio = slipRatio[0]; old.FL.angle = slipAngle[0];
          old.FR.temp = tireTemp[1]; old.FR.ratio = slipRatio[1]; old.FR.angle = slipAngle[1];
          old.RL.temp = tireTemp[2]; old.RL.ratio = slipRatio[2]; old.RL.angle = slipAngle[2];
          old.RR.temp = tireTemp[3]; old.RR.ratio = slipRatio[3]; old.RR.angle = slipAngle[3];
          old.time = now;
          old.speed = speed;
          historyTire.current.push(old);
        }
      }
    }`;

if (content.indexOf(search) === -1) {
  console.log("Could not find the target code in TelemetryView.tsx!");
  process.exit(1);
}

content = content.replace(search, replace);
fs.writeFileSync(path, content, 'utf8');
console.log("Successfully implemented Zero-Allocation Object Pool.");
