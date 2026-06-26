const fs = require('fs');
const path = 'd:/FH6-HorizonTuner/frontend/src/components/TelemetryView.tsx';
let lines = fs.readFileSync(path, 'utf8').split('\n');

// Find the first end of TelemetryView
// It ends with:
//     </div>
//     </div>
//   );
// };
let endOfTelemetryView = -1;
for (let i = 430; i < lines.length; i++) {
  if (lines[i].trim() === '};' && lines[i-1].trim() === ');' && lines[i-2].trim() === '</div>') {
    endOfTelemetryView = i;
    break;
  }
}

// Find getSlipColor
let getSlipColorStart = -1;
for (let i = endOfTelemetryView + 1; i < lines.length; i++) {
  if (lines[i].includes('const getSlipColor = (ratio: number) => {')) {
    getSlipColorStart = i;
    break;
  }
}

console.log("endOfTelemetryView:", endOfTelemetryView);
console.log("getSlipColorStart:", getSlipColorStart);

if (endOfTelemetryView !== -1 && getSlipColorStart !== -1) {
  const newLines = [];
  // 1. Keep everything up to endOfTelemetryView
  for (let i = 0; i <= endOfTelemetryView; i++) {
    newLines.push(lines[i]);
  }
  
  // 2. Insert the correct InputBar
  newLines.push('');
  newLines.push('const InputBar: React.FC<{label: string, selector: (d: any) => number, max: number, color: string}> = ({label, selector, max, color}) => {');
  newLines.push('  const barRef = useRef<HTMLDivElement>(null);');
  newLines.push('  const textRef = useRef<HTMLSpanElement>(null);');
  newLines.push('  useEffect(() => {');
  newLines.push('    const handleDraw = (e: any) => {');
  newLines.push('      const data = e.detail;');
  newLines.push('      if (!data || data.IsRaceOn !== 1) return;');
  newLines.push('      const percent = Math.min((selector(data) / max) * 100, 100);');
  newLines.push('      if (barRef.current) barRef.current.style.width = percent + \'%\';');
  newLines.push('      if (textRef.current) textRef.current.innerText = Math.round(percent) + \'%\';');
  newLines.push('    };');
  newLines.push('    telemetryEmitter.addEventListener(\'update\', handleDraw);');
  newLines.push('    return () => telemetryEmitter.removeEventListener(\'update\', handleDraw);');
  newLines.push('  }, [selector, max]);');
  newLines.push('  return (');
  newLines.push('    <div>');
  newLines.push('      <div style={{ display: \'flex\', justifyContent: \'space-between\', fontSize: \'0.85rem\', color: \'var(--text-secondary)\', marginBottom: \'4px\' }}>');
  newLines.push('        <span>{label}</span>');
  newLines.push('        <span ref={textRef}>0%</span>');
  newLines.push('      </div>');
  newLines.push('      <div style={{ width: \'100%\', height: \'10px\', background: \'rgba(255,255,255,0.1)\', borderRadius: \'5px\', overflow: \'hidden\' }}>');
  newLines.push('        <div ref={barRef} style={{ height: \'100%\', width: \'0%\', background: color, transition: \'width 0.05s linear\' }} />');
  newLines.push('      </div>');
  newLines.push('    </div>');
  newLines.push('  );');
  newLines.push('};');
  newLines.push('');
  
  // 3. Keep everything from getSlipColor onwards
  for (let i = getSlipColorStart; i < lines.length; i++) {
    newLines.push(lines[i]);
  }
  
  fs.writeFileSync(path, newLines.join('\n'), 'utf8');
  console.log("Repaired successfully.");
} else {
  console.log("Could not find markers.");
}
