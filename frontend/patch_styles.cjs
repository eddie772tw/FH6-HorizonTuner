const fs = require('fs');
const path = 'd:/FH6-HorizonTuner/frontend/src/components/TelemetryView.tsx';

let content = fs.readFileSync(path, 'utf8');

// Replace TireRadar styling
content = content.replace(
  /const rOuter = radius \* 0\.9;[\s\S]*?ctx\.restore\(\);/m,
  `
          // Old style radar border
          const isLosingGrip = Math.abs(cRatio) > 1.0 || Math.abs(cAngle) > 1.0;
          ctx.beginPath();
          ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2);
          ctx.strokeStyle = isLosingGrip ? '#ff003c' : 'rgba(255,255,255,0.1)';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Crosshairs
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(255,255,255,0.1)';
          ctx.lineWidth = 1;
          ctx.moveTo(0, radius); ctx.lineTo(radius * 2, radius);
          ctx.moveTo(radius, 0); ctx.lineTo(radius, radius * 2);
          ctx.stroke();

          // 1.0 Threshold Circle (dashed)
          ctx.beginPath();
          ctx.setLineDash([3, 3]);
          ctx.arc(radius, radius, radius / displayLimit, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,0,0,0.5)';
          ctx.stroke();
          ctx.setLineDash([]);
  `
);

content = content.replace(
  /const dotColor = getSlipColor\(cRatio\);\s*const px = Math\.max\(-displayLimit, Math\.min\(displayLimit, cAngle\)\);\s*const py = Math\.max\(-displayLimit, Math\.min\(displayLimit, cRatio\)\);\s*ctx\.beginPath\(\);\s*ctx\.arc\(radius \+ \(px \/ displayLimit\) \* radius, radius - \(py \/ displayLimit\) \* radius, 6, 0, Math\.PI \* 2\);\s*ctx\.fillStyle = dotColor;\s*ctx\.fill\(\);/,
  `
          const px = Math.max(-displayLimit, Math.min(displayLimit, cAngle));
          const py = Math.max(-displayLimit, Math.min(displayLimit, cRatio));
          const dotColor = isLosingGrip ? '#ff003c' : '#00f0ff';
          ctx.beginPath();
          ctx.arc(radius + (px / displayLimit) * radius, radius - (py / displayLimit) * radius, 4, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.shadowBlur = 8;
          ctx.shadowColor = dotColor;
          ctx.fill();
          ctx.shadowBlur = 0;
  `
);

// TireRadar Title & Container
content = content.replace(
  /background: 'rgba\(255,255,255,0\.02\)', padding: '0\.8rem', borderRadius: '8px'/g,
  `background: 'rgba(0,0,0,0.2)', padding: '0.8rem', borderRadius: '8px'`
);

content = content.replace(
  /<div style={{ fontSize: '0\.8rem', color: 'var\(--text-secondary\)', marginBottom: '0\.5rem', fontWeight: 600 }}>\{title\}<\/div>/g,
  `<div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>{title}</div>`
);


// SuspensionBar Canvas
content = content.replace(
  /ctx\.clearRect\(0, 0, 150, 60\);\s*ctx\.beginPath\(\);\s*ctx\.strokeStyle = 'rgba\(255,255,255,0\.4\)';\s*ctx\.lineWidth = 2;\s*ctx\.lineJoin = 'round';/m,
  `
          ctx.clearRect(0, 0, 150, 60);
          const w = 150, h = 60;
          const warningH = h * 0.05;
          ctx.fillStyle = 'rgba(255, 0, 60, 0.15)';
          ctx.fillRect(0, 0, w, warningH);
          ctx.fillRect(0, h - warningH, w, warningH);
          
          ctx.beginPath();
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = 'rgba(255, 0, 60, 0.2)';
          ctx.lineWidth = 1;
          ctx.moveTo(0, warningH); ctx.lineTo(w, warningH);
          ctx.moveTo(0, h - warningH); ctx.lineTo(w, h - warningH);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.beginPath();
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, '#ff003c');
          grad.addColorStop(0.05, 'var(--primary)');
          grad.addColorStop(0.95, 'var(--primary)');
          grad.addColorStop(1, '#ff003c');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2;
          ctx.lineJoin = 'round';
  `
);

fs.writeFileSync(path, content, 'utf8');
console.log('Styles patched successfully.');
