const fs = require('fs');
const path = require('path');

const filePath = 'd:/FH6-HorizonTuner/frontend/src/components/TelemetryView.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Replace history states with refs
content = content.replace(
  /const \[historyG, setHistoryG\] = useState<\{lat: number, lon: number, time: number\}\[\]>\(\[\]\);/,
  'const historyG = useRef<{lat: number, lon: number, time: number}[]>([]);'
);
content = content.replace(
  /const \[historySusp, setHistorySusp\] = useState<\{FL: number, FR: number, RL: number, RR: number, time: number\}\[\]>\(\[\]\);/,
  'const historySusp = useRef<{FL: number, FR: number, RL: number, RR: number, time: number}[]>([]);'
);
content = content.replace(
  /const \[historyTire, setHistoryTire\] = useState<\{([\s\S]*?)\}\[\]>\(\[\]\);/,
  'const historyTire = useRef<{$1}[]>([]);'
);

// Replace useEffect updates
const oldUpdateRegex = /setHistoryG\(prev => \{[\s\S]*?now - p\.time <= 30000\);\s*\}\);[\s\S]*?setHistorySusp\(prev => \{[\s\S]*?now - p\.time <= 30000\);\s*\}\);[\s\S]*?setHistoryTire\(prev => \{[\s\S]*?now - p\.time <= 30000\);\s*\}\);/;

const newUpdate = `historyG.current.push({ lat, lon, time: now });
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

content = content.replace(oldUpdateRegex, newUpdate);

// Replace variable usages
content = content.replace(/historyG\.forEach/g, 'historyG.current.forEach');
content = content.replace(/historySusp\.length/g, 'historySusp.current.length');
content = content.replace(/historySusp\.map/g, 'historySusp.current.map');
content = content.replace(/historyTire\.map/g, 'historyTire.current.map');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed TelemetryView.tsx');
