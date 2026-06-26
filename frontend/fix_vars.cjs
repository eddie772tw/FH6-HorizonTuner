const fs = require('fs');
const path = 'd:/FH6-HorizonTuner/frontend/src/components/TelemetryView.tsx';
let content = fs.readFileSync(path, 'utf8');

// The main body 'now' (around line 490) is unused, so let's just remove it.
// Wait, the main body 'now' was: `const now = performance.now();`
// We should only remove it if it's the one before `const layoutLeft`.
content = content.replace(/  const now = performance\.now\(\);\r?\n\r?\n  const tempMinScale = 50;/g, '  const tempMinScale = 50;');

// Now we fix the missing variables inside handleDraw.
const searchBlock = `      const now = performance.now();
      
      const bins = new Array(numBins).fill(0);`;

const replaceBlock = `      const now = performance.now();
      const history3s = history.filter(p => now - p.time <= 3000);
      
      const bins = new Array(numBins).fill(0);`;

content = content.replace(searchBlock, replaceBlock);

const searchBlock2 = `        if (binIdx >= numBins) binIdx = numBins - 1;
        bins[binIdx]++;
      });

      const rCanvas = radarCanvasRef.current;`;

const replaceBlock2 = `        if (binIdx >= numBins) binIdx = numBins - 1;
        bins[binIdx]++;
      });
      const maxBinCount = Math.max(1, ...bins);

      const rCanvas = radarCanvasRef.current;`;

content = content.replace(searchBlock2, replaceBlock2);

// What about cTemp? `let cTemp = currentData.temp;` is unused because `minTemp` and `maxTemp` inside handleDraw were removed.
// We can just remove cTemp.
// And `now` on line 490: 
content = content.replace(/  const now = performance\.now\(\);\r?\n\s+const tempMinScale = 50;/m, '  const tempMinScale = 50;');
// Remove cTemp:
content = content.replace(/      let cTemp = currentData\.temp;\r?\n/g, '');
content = content.replace(/        cTemp = liveData\.TireTemp\[idx\];\r?\n/g, '');

fs.writeFileSync(path, content, 'utf8');
console.log("Fixed unused variables and restored missing ones.");
