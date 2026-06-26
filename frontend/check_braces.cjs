const fs = require('fs');
const code = fs.readFileSync('d:/FH6-HorizonTuner/frontend/src/components/TelemetryView.tsx', 'utf8');
let depth = 0;
for (let i = 0; i < code.length; i++) {
  if (code[i] === '{') depth++;
  if (code[i] === '}') depth--;
}
console.log('Brace depth at EOF:', depth);
