// Regenerate the editable SVG from the same geometry imported by the renderer.
// Then export it with Inkscape; no geometry is hand-adjusted in the generated SVG.
import { writeFile } from 'node:fs/promises';
import { ARC, arcFrame, arcSamples } from '../../arc-geometry.js';
const number = value => Number(value.toFixed(4));
const xy = p => `${number(p.x)} ${number(p.y)}`;
function housingPath(outward, bottomLeft, bottomRight, bottomY, outer = false) {
  const points = arcSamples(outward);
  const left = points[0], right = points.at(-1);
  const t0 = arcFrame(0).tangent, t1 = arcFrame(1).tangent;
  // Short tangent-matched shoulder transitions join the unchanged lower fascia.
  const leftControl = { x: left.x - t0.x * 12, y: left.y - t0.y * 12 };
  const rightControl = { x: right.x + t1.x * 12, y: right.y + t1.y * 12 };
  const arc = points.map((p, i) => `${i ? 'L' : 'M'}${xy(p)}`).join(' ');
  const bottom = outer
    ? `C${xy(rightControl)} ${bottomRight} ${bottomY - 30} ${bottomRight} ${bottomY} Q714 272 703 272 H15 Q7 272 11 258`
    : `C${xy(rightControl)} ${bottomRight} ${bottomY - 30} ${bottomRight} ${bottomY} H${bottomLeft}`;
  return `${arc} ${bottom} C${bottomLeft} ${bottomY - 30} ${xy(leftControl)} ${xy(left)}Z`;
}
const outer = housingPath(ARC.outerEdge, 11, 710, 258, true);
const face = housingPath(ARC.faceEdge, 32, 690, 255);
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="720" height="300" viewBox="0 0 720 300">
  <title>AP1 Rev Arc original smoked instrument fascia</title>
  <desc>Original artwork by Bagley as Codex. Upper contours generated from arc-geometry.js with normal offsets shared by the RPM band and labels. No Honda artwork or logo.</desc>
  <defs>
    <linearGradient id="rim" x2="0" y2="1"><stop stop-color="#45433e"/><stop offset=".18" stop-color="#252625"/><stop offset=".8" stop-color="#101312"/><stop offset="1" stop-color="#393a34"/></linearGradient>
    <linearGradient id="face" x2="0" y2="1"><stop stop-color="#101714"/><stop offset=".5" stop-color="#09100e"/><stop offset="1" stop-color="#111812"/></linearGradient>
    <linearGradient id="glass" x2=".8" y2="1"><stop stop-color="#c7caba" stop-opacity=".055"/><stop offset=".6" stop-color="#c7caba" stop-opacity="0"/></linearGradient>
  </defs>
  <g inkscape:groupmode="layer" inkscape:label="Shared-curve original housing">
    <path d="${outer}" fill="url(#rim)" stroke="#4b4c40" stroke-width="1.5"/>
    <path d="${face}" fill="url(#face)" stroke="#020603" stroke-width="4"/>
    <path d="${face}" fill="url(#glass)"/>
    <path d="M33 257H689" fill="none" stroke="#747161" stroke-opacity=".38"/>
    <path d="M75 278H645" fill="none" stroke="#090d0a" stroke-width="6" stroke-linecap="round"/>
  </g>
</svg>
`;
await writeFile(new URL('../../assets/fascia.svg', import.meta.url), svg);
console.log('Regenerated fascia.svg from arc-geometry.js; export with Inkscape.');
