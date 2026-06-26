const fs = require('fs');
const code = fs.readFileSync('d:/FH6-HorizonTuner/frontend/src/components/TelemetryView.tsx', 'utf8');
const lines = code.split('\n');
let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    if (line[j] === '{') depth++;
    if (line[j] === '}') depth--;
  }
  if (depth === 1 && line.startsWith('const ')) {
    console.log(`Line ${i+1}: ${line} (Depth: ${depth})`);
  }
}
