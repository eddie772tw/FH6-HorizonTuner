const fs = require('fs');

const path = 'd:/FH6-HorizonTuner/frontend/src/components/TelemetryView.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Fix Canvas style in TireRadar
// Find: <canvas ref={radarCanvasRef} width={radius*2} height={radius*2} style={{position: 'absolute', top: 0, left: 0}} />
content = content.replace(
  /<canvas ref=\{radarCanvasRef\} width=\{radius\*2\} height=\{radius\*2\} style=\{\{position: 'absolute', top: 0, left: 0\}\} \/>/g,
  `<canvas ref={radarCanvasRef} width={radius*2} height={radius*2} style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%'}} />`
);

// Find: <canvas ref={histCanvasRef} width={histWidth} height={histHeight} style={{ display: 'block' }} />
content = content.replace(
  /<canvas ref=\{histCanvasRef\} width=\{histWidth\} height=\{histHeight\} style=\{\{ display: 'block' \}\} \/>/g,
  `<canvas ref={histCanvasRef} width={histWidth} height={histHeight} style={{ display: 'block', width: '100%', height: '100%' }} />`
);

// 2. Fix Canvas style in SuspensionBar
// Find: <canvas ref={canvasRef} width={svgWidth} height={svgHeight} style={{ display: 'block' }} />
content = content.replace(
  /<canvas ref=\{canvasRef\} width=\{svgWidth\} height=\{svgHeight\} style=\{\{ display: 'block' \}\} \/>/g,
  `<canvas ref={canvasRef} width={svgWidth} height={svgHeight} style={{ display: 'block', width: '100%', height: '100%' }} />`
);

// 3. Fix TireRadar layout for outside alignment
// We need to change the justifyContent and grouping.
// Original:
/*
      <div style={{ flex: 1, display: 'flex', flexDirection, gap: '1rem', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: layoutLeft ? 'row' : 'row-reverse', alignItems: 'center', gap: '0.8rem' }}>
          
          <div style={{ position: 'relative', ... radar canvas container ...
          <div style={{ display: 'flex', ... text data container ...
        </div>

        <div style={{ display: 'flex', ... vertical bar container ...
        <div style={{ flex: 1, ... hist canvas container ...
      </div>
*/
// New layout: Group (Radar + Text) and Group (Vertical Bar + Hist), space-between outer.
// Because flexDirection is already set by layoutLeft ? 'row' : 'row-reverse', the elements flow either left-to-right or right-to-left.
// Wait, if we use space-between, the left group goes to far left, right group goes to far right.
// For layoutLeft=false (Left Tires, flexDirection='row-reverse'):
// Right-to-Left: Element 1 is on Right, Element 2 is on Left.
// If we group them:
// Group 1: Radar + Text
// Group 2: Vertical Bar + Hist
// In DOM:
// <Outer flexDirection="row-reverse" justifyContent="space-between">
//   <Group 1 flexDirection="row-reverse">
//     <Radar />
//     <Text />
//   </Group 1>
//   <Group 2 flexDirection="row-reverse">
//     <VerticalBar />
//     <Hist />
//   </Group 2>
// </Outer>
// This means Group 1 is on the RIGHT (Inside). Group 2 is on the LEFT (Outside). This is correct!
// Radar is on the Right. Hist is on the Left.

const oldLayout = `
      <div style={{ flex: 1, display: 'flex', flexDirection, gap: '1rem', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: layoutLeft ? 'row' : 'row-reverse', alignItems: 'center', gap: '0.8rem' }}>
          
          <div style={{ position: 'relative', width: \`\${radius*2}px\`, height: \`\${radius*2}px\`, borderRadius: '50%', border: isLosingGrip ? '2px solid #ff003c' : '2px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <canvas ref={radarCanvasRef} width={radius*2} height={radius*2} style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%'}} />
            
            <div style={{ position: 'absolute', top: \`\${radius - (radius/displayLimit)}px\`, left: \`\${radius - (radius/displayLimit)}px\`, width: \`\${(radius/displayLimit)*2}px\`, height: \`\${(radius/displayLimit)*2}px\`, borderRadius: '50%', border: '1px dashed rgba(255,0,0,0.5)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'rgba(255,255,255,0.1)', top: '50%', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', width: '1px', height: '100%', background: 'rgba(255,255,255,0.1)', left: '50%', pointerEvents: 'none' }} />

            <div style={{
              position: 'absolute',
              width: '8px',
              height: '8px',
              backgroundColor: dotColor,
              borderRadius: '50%',
              boxShadow: \`0 0 8px \${dotColor}\`,
              transform: \`translate(\${radius + (x / displayLimit) * radius - 4}px, \${radius + (y / displayLimit) * radius - 4}px)\`,
              transition: 'transform 0.05s linear, background 0.1s',
              pointerEvents: 'none'
            }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', alignItems: layoutLeft ? 'flex-start' : 'flex-end', fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
             <span style={{ color: getTempColor(currentData.temp), fontWeight: 'bold', fontSize: '1rem', marginBottom: '0.2rem' }}>{Math.round(tempVal.value)}{tempVal.label}</span>
             <span>Min: <span style={{ color: getTempColor(minTemp), fontWeight: 600 }}>{Math.round(minTemp)}</span></span>
             <span>Max: <span style={{ color: getTempColor(maxTemp), fontWeight: 600 }}>{Math.round(maxTemp)}</span></span>
             <span>Ang: {currentData.angle.toFixed(2)}</span>
             <span>Ratio: {Math.round(currentData.ratio * 100)}%</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: \`\${histHeight}px\`, width: '24px', justifyContent: 'center' }}>
          <div style={{ width: '16px', height: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: \`\${getTempY(210)}%\`, left: -2, right: -2, height: '1px', background: '#ff0000', zIndex: 1 }} />
            <div style={{ position: 'absolute', top: \`\${getTempY(150)}%\`, left: -2, right: -2, height: '1px', background: '#0088ff', zIndex: 1 }} />
            
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: \`\${100 - getTempY(currentData.temp)}%\`,
              background: getTempColor(currentData.temp),
              transition: 'height 0.05s linear, background 0.1s',
              borderRadius: currentData.temp > 210 ? '8px' : '0 0 8px 8px'
            }} />
          </div>
        </div>

        <div style={{ flex: 1, height: \`\${histHeight}px\`, position: 'relative', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <canvas ref={histCanvasRef} width={histWidth} height={histHeight} style={{ display: 'block', width: '100%', height: '100%' }} />
        </div>
      </div>
`.trim();

// Ensure the match exists by stripping out the style replacements if they don't match. We already did the replacement above, so oldLayout should reflect that!
const newLayout = `
      <div style={{ flex: 1, display: 'flex', flexDirection, gap: '1rem', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        {/* Inner Group: Radar + Text */}
        <div style={{ display: 'flex', flexDirection: layoutLeft ? 'row' : 'row-reverse', alignItems: 'center', gap: '0.8rem' }}>
          
          <div style={{ position: 'relative', width: \`\${radius*2}px\`, height: \`\${radius*2}px\`, borderRadius: '50%', border: isLosingGrip ? '2px solid #ff003c' : '2px solid rgba(255,255,255,0.1)', overflow: 'hidden', flexShrink: 0 }}>
            <canvas ref={radarCanvasRef} width={radius*2} height={radius*2} style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%'}} />
            
            <div style={{ position: 'absolute', top: \`\${radius - (radius/displayLimit)}px\`, left: \`\${radius - (radius/displayLimit)}px\`, width: \`\${(radius/displayLimit)*2}px\`, height: \`\${(radius/displayLimit)*2}px\`, borderRadius: '50%', border: '1px dashed rgba(255,0,0,0.5)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'rgba(255,255,255,0.1)', top: '50%', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', width: '1px', height: '100%', background: 'rgba(255,255,255,0.1)', left: '50%', pointerEvents: 'none' }} />

            <div style={{
              position: 'absolute',
              width: '8px',
              height: '8px',
              backgroundColor: dotColor,
              borderRadius: '50%',
              boxShadow: \`0 0 8px \${dotColor}\`,
              transform: \`translate(\${radius + (x / displayLimit) * radius - 4}px, \${radius + (y / displayLimit) * radius - 4}px)\`,
              transition: 'transform 0.05s linear, background 0.1s',
              pointerEvents: 'none'
            }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', alignItems: layoutLeft ? 'flex-start' : 'flex-end', fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', width: '70px' }}>
             <span style={{ color: getTempColor(currentData.temp), fontWeight: 'bold', fontSize: '1rem', marginBottom: '0.2rem' }}>{Math.round(tempVal.value)}{tempVal.label}</span>
             <span>Min: <span style={{ color: getTempColor(minTemp), fontWeight: 600 }}>{Math.round(minTemp)}</span></span>
             <span>Max: <span style={{ color: getTempColor(maxTemp), fontWeight: 600 }}>{Math.round(maxTemp)}</span></span>
             <span>Ang: {currentData.angle.toFixed(2)}</span>
             <span>Ratio: {Math.round(currentData.ratio * 100)}%</span>
          </div>
        </div>

        {/* Outer Group: Vertical Bar + Hist */}
        <div style={{ display: 'flex', flexDirection: layoutLeft ? 'row' : 'row-reverse', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: \`\${histHeight}px\`, width: '24px', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ width: '16px', height: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: \`\${getTempY(210)}%\`, left: -2, right: -2, height: '1px', background: '#ff0000', zIndex: 1 }} />
              <div style={{ position: 'absolute', top: \`\${getTempY(150)}%\`, left: -2, right: -2, height: '1px', background: '#0088ff', zIndex: 1 }} />
              
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: \`\${100 - getTempY(currentData.temp)}%\`,
                background: getTempColor(currentData.temp),
                transition: 'height 0.05s linear, background 0.1s',
                borderRadius: currentData.temp > 210 ? '8px' : '0 0 8px 8px'
              }} />
            </div>
          </div>

          <div style={{ flex: 1, height: \`\${histHeight}px\`, position: 'relative', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
            <canvas ref={histCanvasRef} width={histWidth} height={histHeight} style={{ display: 'block', width: '100%', height: '100%' }} />
          </div>
        </div>
      </div>
`.trim();

// Just do a manual substring replace to be 100% safe.
const idx = content.indexOf("<div style={{ flex: 1, display: 'flex', flexDirection, gap: '1rem', alignItems: 'center', justifyContent: 'center' }}>");
if (idx !== -1) {
  // Find the end of this div block.
  // We can just use string replacement on the block.
  content = content.replace(oldLayout, newLayout);
}

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed Canvas styles and Layout');
