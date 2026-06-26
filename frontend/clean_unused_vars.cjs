const fs = require('fs');
const path = 'd:/FH6-HorizonTuner/frontend/src/components/TelemetryView.tsx';
let content = fs.readFileSync(path, 'utf8');

// Remove unused main body vars
content = content.replace(/  const x = Math\.max\(-displayLimit, Math\.min\(displayLimit, currentData\.angle\)\);\r?\n/g, '');
content = content.replace(/  const y = Math\.max\(-displayLimit, Math\.min\(displayLimit, currentData\.ratio\)\);\r?\n/g, '');
content = content.replace(/  const dotColor = getSlipColor\(currentData\.ratio\);\r?\n/g, '');
content = content.replace(/  const history3s = history\.filter\(p => now - p\.time <= 3000\);\r?\n/g, '');
content = content.replace(/  const maxBinCount = Math\.max\(1, \.\.\.bins\);\r?\n/g, '');

// Remove unused vars in handleDraw
content = content.replace(/      const minTemp = history\.length > 0 \? Math\.min\(\.\.\.history\.map\(p => p\.temp\)\) : cTemp;\r?\n/g, '');
content = content.replace(/      const maxTemp = history\.length > 0 \? Math\.max\(\.\.\.history\.map\(p => p\.temp\)\) : cTemp;\r?\n/g, '');

fs.writeFileSync(path, content, 'utf8');
console.log("Cleaned unused variables.");
