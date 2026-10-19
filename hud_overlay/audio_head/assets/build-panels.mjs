// Rebuild the editable SVG faceplates: node hud_overlay/audio_head/assets/build-panels.mjs
// Coordinates and colours follow the native res_220 atlas / clean plates. No raster embedding.
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const out = fileURLToPath(new URL('.', import.meta.url));
const glyphs = JSON.parse(readFileSync(out + 'panel-glyphs.json', 'utf8'));
// Reuse upstream vector outlines. Original downloads and provenance live in brands/.
const brands = {};
for (const [name, width, height] of [['alpine',734.51,89.73],['pioneer',107,16],['pioneer_1969',7112,1000],['sony',100,18],['kenwood',460.5,74],['cdda',437.33334,268]]) {
    const source = readFileSync(out + 'brands/' + name + '.svg', 'utf8').replaceAll('\r\n', '\n');
    let body = source.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/)[1];
    if (name === 'alpine') body = Array.from(body.matchAll(/<(?:rect|polygon|path)\b(?=[^>]*class="cls-1")[^>]*\/>/g), match => match[0]).join('');
    body = body.replace(/<(?:style|metadata|title)\b[^>]*>[\s\S]*?<\/(?:style|metadata|title)>/g, '')
        .replace(/<!--[\s\S]*?-->/g, '').replace(/\s(?:class|id)="[^"]*"/g, '')
        .replace(/\sfill="(?!none)[^"]*"/g, '').replace(/fill:#[\da-f]+;?/gi, '')
        .replace(/[ \t]+$/gm, '');
    brands[name] = { width, height, body };
}
const n = value => Number(value.toFixed(3));
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const rect = (x, y, w, h, fill, radius = 0, extra = '') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" ${extra}/>`;
const path = (d, stroke, width = 1, fill = 'none', extra = '') =>
    `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
const line = (x, y, x2, y2, color, width = 1) => path(`M${x} ${y}L${x2} ${y2}`, color, width);
const text = (value, x, y, size, color, width, extra = '') =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" textLength="${width}" lengthAdjust="spacingAndGlyphs" ${extra}>${esc(value)}</text>`;
const circle = (x, y, r, fill, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const frame = (x, y, w, h, color, radius = 0, stroke = .8) => rect(x, y, w, h, 'none', radius, `stroke="${color}" stroke-width="${stroke}"`);
const italic = 'font-style="italic" font-weight="700"';
const bold = 'font-weight="700"';
const condensed = 'font-family="Arial Narrow,Arial,sans-serif"';
const label = (value, x, y, width, color = '#aecbd0', size = 7) => text(value, x, y, size, color, width, condensed);

function rds(x, y, scale = 1, color = '#b5b7b7') {
    return glyph('rds', x, y, 21 * scale, 13 * scale, color);
}
function glyph(name, x, y, w, h, fill) {
    const g = glyphs[name];
    return `<path transform="translate(${x} ${y}) scale(${n(w/g.region.width)} ${n(h/g.region.height)})" fill="${fill || g.fill}" fill-rule="evenodd" d="${g.d}"/>`;
}
function alpine(x, y, color = '#a48b22', width = 88) {
    return brand('alpine', x, y, width, 14, color);
}
function brand(name, x, baseline, width, height, color) {
    const art = brands[name];
    const scale = Math.min(width / art.width, height / art.height);
    return `<g transform="translate(${n(x + (width-art.width*scale)/2)} ${n(baseline-art.height*scale)}) scale(${scale})" fill="${color}" fill-rule="evenodd">${art.body}</g>`;
}
function grid(x, y, cols, rows, stepX, stepY, w, h, color) {
    let s = '';
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++)
        s += rect(n(x + col * stepX), n(y + row * stepY), w, h, color);
    return s;
}
function pioneer(x, y, width = 66, height = 10) {
    return brand('pioneer', x, y, width, height, '#e5e8e8');
}
function corners(x, y, w, h, color) {
    return path(`M${x} ${y+8}V${y}H${x+8}M${x+w-8} ${y}H${x+w}V${y+8}M${x+w} ${y+h-8}V${y+h}H${x+w-8}M${x+8} ${y+h}H${x}V${y+h-8}`, color, 1);
}
function pane(name, w, h, content, defs = '', material = '') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<title>${name}</title>
<desc>Vector redraw referenced to the native ForzaHUD radio atlas. Matte opacity 0.75; decoration keeps its own colour and coverage.</desc>
<defs>${defs}</defs>
<g opacity=".75">${rect(0, 0, w, h, '#000')}${material}</g>
<g font-family="Arial Narrow,Arial,sans-serif" font-weight="700" stroke-linejoin="round" stroke-linecap="round">${content}</g>
</svg>\n`;
    if (process.argv.includes('--check')) {
        if (readFileSync(out + name + '.svg', 'utf8').replaceAll('\r\n', '\n') !== svg) throw new Error(name + '.svg is stale');
    } else writeFileSync(out + name + '.svg', svg);
}

// Pioneer DEH-P6100R: original LCD and navigation/feature glyphs.
{
    let s = frame(7, 2, 61, 13, '#424849', 3, .55) + pioneer(11, 12, 52, 9) + label('DEH-P6100R', 72, 13, 35, '#d2d4d3', 6);
    s += label('MOSFET 50W×4', 211, 11, 47, '#d5d6d6', 6) + label('DAB control', 262, 11, 36, '#d5d6d6', 6);
    s += rds(303, 3, .7) + text('R·D·S', 320, 12, 9, '#c5c8c9', 26, italic) + brand('cdda', 350, 13, 18, 11, '#667073');
    s += frame(6, 18, 367, 71, '#292b27', 4, .65);
    s += path('M291 23H278Q274 23 274 28V41Q274 47 279 47H291M350 23H363Q368 23 368 28V41Q368 47 363 47H350', '#00b81a', 1.25);
    s += path('M306 28L311 23H323L328 28ZM306 44L311 49H323L328 44ZM305 31L297 35L305 39ZM337 31L345 35L337 39Z', '#00c52e', 1.1);
    s += path('M311 26H323M311 46H323M302 34V36M340 34V36', '#43e965', .8);
    s += path('M279 56L274 61Q272 65 280 65H365Q370 65 365 61L361 57M280 72L274 77Q271 82 279 82H363Q370 82 365 77L361 72', '#b8c124', 1.1);
    s += frame(347, 55, 9, 9, '#e26309', 4, 1.3) + frame(353, 55, 9, 9, '#e26309', 4, 1.3);
    s += path('M278 70H296L292 75H281ZM281 76H292L291 80H282ZM341 70H347L349 74H355L357 70H362L358 77H354V81H347V77Z', '#ec6909', 1.2);
    s += label('FIE', 315, 80, 13, '#ef6f13', 10);
    s += label('OFF', 11, 96, 11, '#b2b5b4', 6) + label('PTY', 323, 96, 12, '#c4c8c6', 6) + label('TEXT', 350, 96, 16, '#c4c8c6', 6);
    for (let x = 53; x < 300; x += 42) s += circle(x, 93, .7, '#737b7d');
    pane('pioneer', 380, 98, s);
}

// Panasonic's warm material is translucent; the scale ink is fully opaque.
{
    const defs = '<linearGradient id="gold" x2="0" y2="1"><stop stop-color="#f4a300"/><stop offset=".14" stop-color="#e8ba67"/><stop offset=".57" stop-color="#c3b59c"/><stop offset=".87" stop-color="#deb67b"/><stop offset="1" stop-color="#f7a200"/></linearGradient><linearGradient id="edge" x2="0" y2="1"><stop stop-color="#ffd64d"/><stop offset=".5" stop-color="#ac6815"/><stop offset="1" stop-color="#ffa710"/></linearGradient>';
    let s = '<g opacity=".75">' + frame(2, 2, 434, 76, 'url(#edge)', 8, 2) + '</g>';
    for (const cx of [104, 334]) {
        s += text('POWER / WATTS', cx - 32, 15, 5.5, '#42381c', 63, 'letter-spacing="1"');
        s += path(`M${cx-82} 35L${cx-63} 54H${cx+63}L${cx+82} 35M${cx-78} 39H${cx+78}M${cx-72} 46H${cx+72}`, '#36392c', .7);
        const values = ['0', '0.01', '0.1', '1', '10', '50'];
        for (let i = 0; i < 31; i++) {
            const offset = -82 + i * 164 / 30;
            const length = i % 6 === 0 ? 13 : i % 3 === 0 ? 10 : 6;
            const endX = cx + offset * .8;
            s += line(n(cx + (endX-cx) * (74+length)/74), 42-length, n(endX), 42, '#34352b', i % 6 === 0 ? .8 : .5);
        }
        for (let i = 0; i < 6; i++) s += text(values[i], cx - 82 + i * 32, 26, 5.5, '#373429', values[i].length * 3.2, 'text-anchor="middle"');
        for (let i = 0; i < 25; i++) {
            const offset = -63 + i * 126 / 24;
            const length = i % 4 === 0 ? 7 : 4;
            const endX = cx + offset * .91;
            s += line(n(cx + (endX-cx) * (62+length)/62), 54-length, n(endX), 54, '#37382c', .55);
        }
        for (const [i, value] of ['−40','−20','−10','−5','0'].entries())
            s += text(value, cx - 42 + i * 21, 63, 4, '#464032', value.length * 2.4, 'text-anchor="middle"');
        s += text('LEVEL / dB', cx - 28, 71, 5.5, '#493b24', 56, 'letter-spacing="1"');
    }
    s += text('Pure Sound Style', 167, 73, 8.2, '#503e1b', 105, 'font-family="Georgia,serif" font-style="italic" font-weight="700"');
    const material = rect(1, 1, 436, 79, 'url(#gold)', 9) + path('M4 82L70 110H368L434 82', 'none', 0, '#080c10') + rect(70, 84, 298, 26, '#030505') + rect(100, 92, 238, 18, '#111415');
    pane('panasonic', 438, 110, s, defs, material);
}

{
    let s = label('DEX-P1R', 6, 11, 37, '#d0d6db', 9) + label('MULTI-CD CONTROL', 49, 11, 65, '#cbd0d2', 6) + pioneer(120, 11, 58, 10);
    s += label('SUPER-TUNER', 280, 11, 48, '#b7c0c5', 7) + rds(339, 2, .7) + text('R·D·S', 358, 11, 9, '#c9ced2', 31, italic) + brand('cdda', 392, 12, 15, 10, '#3b4050');
    s += grid(6, 22, 15, 10, 4.4, 4.4, 3.2, 3.2, '#100c21') + label('Hz 25 ─ 500 ─ 16kHz', 6, 79, 68, '#bfbbd7', 6);
    s += frame(6, 83, 68, 11, '#aa39ef', 0, .8) + label('B·B·U·D·J·V·U', 14, 91, 54, '#bb6af0', 6);
    s += label('RTA   STEREO', 81, 94, 64, '#00bd72', 9) + frame(145, 85, 5, 8, '#00bd72', 2) + frame(149, 85, 5, 8, '#00bd72', 2);
    s += label('≪ AUDIO EQUALIZING ≫', 172, 94, 105, '#073d29', 8) + label('MONO  MULTI  DISC', 288, 94, 69, '#063422', 8);
    s += corners(347, 23, 59, 69, '#a2c3d5') + label('PWR', 367, 27, 24, '#6556da', 5);
    s += glyph('dexp1rMotif', 349, 23, 58, 74);
    pane('pioneer_dexp1r', 412, 98, s, '', path('M0 0H400L412 15H0Z', 'none', 0, '#090d12'));
}

{
    let s = brand('pioneer_1969', 1, 14, 104, 14, '#e5e8e8') + label('DEH-P835R', 111, 12, 38, '#ccd2d2', 7);
    s += label('MULTI-CD CONTROL', 158, 12, 54, '#c3c9cc', 5) + label('HIGH-POWER 40W×4', 218, 12, 75, '#e6e7e8', 7) + label('SOUND RETRIEVAL SYSTEM', 303, 12, 81, '#d2d6d8', 5) + label('DSP CONTROL', 402, 12, 48, '#c3c8d0', 7);
    s += corners(6, 25, 83, 58, '#4b8991') + label('ON  ▲  BT', 29, 33, 39, '#28525a', 6) + label('TRK       SEEK', 18, 45, 60, '#5e9da7', 6);
    s += path('M12 52L20 47V57ZM22 52L30 47V57ZM59 47L67 52L59 57ZM69 47L77 52L69 57ZM42 30V70M38 35L42 30L46 35M38 65L42 70L46 65', '#38797c', 1);
    s += label('REV ▼ OFF', 19, 67, 48, '#244e51', 6) + label('SP   PTY  REG', 94, 72, 55, '#8daab3', 7) + label('FUNC V.AUDIO', 94, 81, 55, '#34454a', 7);
    s += label('TRK', 134, 33, 17, '#a5c4d6', 8) + label('CH', 138, 56, 12, '#4c7b94', 8);
    s += grid(158, 23, 16, 10, 10.8, 5.7, 9.2, 4.2, '#11212e');
    s += glyph('p835rMotif', 338, 25, 84, 58);
    s += label('＋IF', 435, 29, 17, '#c8cacc', 5) + label('PTY', 434, 40, 17, '#c8cacc', 5) + label('−SELECT', 432, 49, 21, '#c8cacc', 5);
    s += rds(431, 57, 1.1) + text('R·D·S', 432, 87, 9, '#c0c4c7', 27, italic);
    s += corners(369, 90, 84, 30, '#455fe5') + label('MODE', 400, 99, 21, '#5c79f4', 8) + frame(372, 104, 78, 13, '#5575eb', 0, .8) + label('SPECTRAL ANALYZER', 375, 114, 73, '#89a2f2', 7);
    s += corners(6, 91, 58, 29, '#6d99b0') + circle(15, 97, 3, '#9bc1d7') + label('SUB.W', 32, 102, 31, '#98c3d9', 8) + label('LOUD  FIE', 9, 116, 45, '#668aa2', 8);
    pane('pioneer_p835r', 460, 125, s, '', path('M0 0H451L460 19H0Z', 'none', 0, '#090c10'));
}

{
    let s = brand('sony', 194, 129, 50, 12, '#c3c4c7');
    s += path('M8 17H84L91 10M15 11H89L94 6M349 17H432M352 11H425L420 6M8 109H79L91 116M349 109H432M356 116H416L423 111', '#164582', 1);
    for (const x of [8, 407]) {
        for (let j = 0; j < 7; j++) s += path(`M${x+j*4} 23V36M${x+j*4} 42V55M${x+j*4} 61V74M${x+j*4} 80V93`, '#283d50', 1.4);
        for (const y of [19, 39, 58, 97, 102]) for (let j = 0; j < 8; j++) s += circle(x+j*3.5, y, .6, '#2562a0');
    }
    for (const x of [46, 345]) s += frame(x, 25, 49, 68, '#c8cfce', 6, 1.3) + frame(x+3, 28, 43, 62, '#afb4af', 5, .8);
    s += glyph('sonyDso', 50, 29, 41, 32);
    s += label('DSO', 57, 81, 28, '#cba63a', 15);
    s += path('M347 56H357L365 37L371 69L378 51H390', '#c6a94c', 1.9) + label('EQ7', 356, 81, 29, '#d6b94e', 15);
    s += label('TRACK', 101, 16, 26, '#a18131', 7) + label('SHUFEL2ALL', 101, 50, 62, '#a27a22', 7) + label('LP24   REP12', 101, 68, 61, '#153c61', 7);
    s += label('BANK   LOUD', 285, 50, 57, '#755418', 7) + label('AF TP TF ENTER', 284, 68, 59, '#1b426b', 7);
    s += grid(178, 39, 32, 15, 2.8, 2.9, 1.45, 1.25, '#0a376e');
    // The faceplate's inactive equalizer motif, separate from the live spectrum.
    for (let i = 0; i < 28; i++) s += rect(180+i*2.8, n(53+Math.sin(i*.32)*5), 1.5, 1.2, '#a8b7b6');
    for (const x of [101, 284]) for (const y of [36, 56, 76]) s += grid(x, y, 20, 1, 3, 1, .8, .8, '#245987');
    s += path('M276 53L281 56L276 59Z', 'none', 0, '#c3a43f');
    pane('sony_cdx', 440, 133, s, '', path('M183 115H257L250 133H190Z', 'none', 0, '#080a0b'));
}

{
    let s = '';
    s += glyph('alpineDisc', 3, 4, 96, 82);
    s += text('LOUD', 7, 20, 9, '#737638', 27, italic);
    s += text('NEWS   RPT   ALL   M.I.X.   P/PTY', 115, 20, 9, '#727533', 169, italic);
    s += text('DAF', 115, 41, 9, '#747635', 21, italic) + rect(144, 30, 20, 13, '#eeee85') + text('AP', 146, 40, 8, '#11160b', 15, italic) + text('EON  TP', 171, 41, 9, '#777c3c', 43, italic);
    s += rect(330, 8, 37, 12, '#fafc8b', 1) + text('T.INFO', 332, 17, 8, '#0d130a', 33, italic) + rect(374, 8, 59, 12, '#f2f589', 1) + text('SHUFFLE', 377, 17, 8, '#10150b', 53, italic);
    s += text('CD RECEIVER 40W×4 Amplifier', 115, 110, 9, '#c4c9ca', 142, condensed) + text('CDA-7848', 266, 110, 9, '#dee0e0', 47, condensed) + alpine(347, 110, '#ac9321', 87);
    for (const p of [[38,49],[41,53],[66,57],[68,60]]) s += rect(p[0],p[1],2,3,'#c4d158');
    pane('alpine_7848', 440, 112, s, '', path('M0 91L118 112H440V91Z', 'none', 0, '#080d13'));
}

{
    let s = '';
    s += text('AF T.INFO P.PTY TP', 182, 19, 11, '#79dce3', 116, italic) + text('DAB PS M.I.X.', 182, 39, 11, '#184279', 95, italic) + line(182, 22, 299, 22, '#387a93', .5) + line(182, 41, 278, 41, '#184079', .5);
    s += text('Info.', 297, 42, 9, '#d7eab0', 24, bold);
    const cyan = '#62d6db';
    s += frame(303, 10, 12, 20, '#d3dfa2', 0, .8) + path('M307 14L312 12V24M307 16V24C301 21 302 29 307 27M312 24C307 21 307 28 312 27', '#cbdca3', .9);
    for (let i = 0; i < 7; i++) {
        const x = 324+i*19;
        if (i === 0) s += `<ellipse cx="${x+6}" cy="21" rx="8" ry="11" fill="none" stroke="${cyan}" stroke-width="1.4"/>` + circle(x+6,21,3,'none',`stroke="${cyan}" stroke-width="1"`);
        else if (i === 1 || i === 2) s += path(`M${x} 18H${x+5}V12H${x+9}V16H${x+13}V28H${x}ZM${x+3} 20V25H${x+10}`, cyan, 1.1);
        else if (i === 3) s += path(`M${x+9} 10L${x+1} 20L${x+9} 27L${x+14} 18Z`, cyan, 1.1) + circle(x+7,20,2.5,'none',`stroke="${cyan}"`);
        else s += frame(x, 13, 12, 16, cyan, 1, 1.2) + path(`M${x+3} 22L${x+7} 17L${x+10} 24M${x+4} 16V26`, cyan, .8);
        s += path(`M${x+3} 39L${x+7} 33L${x+11} 39Z`, 'none', 0, '#255c67');
    }
    for (let row = 0; row < 3; row++) {
        const y = 48+row*14;
        s += frame(322, y, 28, 12, '#225964', 0, .6) + text(['Level','Binc','Sub-W'][row], 324, y+9, 9, ['#a7e6df','#254a84','#a5dbd3'][row], 24, italic);
        s += grid(355, y, 36, 6, 2.3, 1.7, .85, .7, '#163e5c');
        s += grid(355, y, 13+row*4, 6, 2.3, 1.7, .85, .7, '#418a92');
    }
    s += text('DAB', 453, 20, 12, '#bdc1c0', 29) + label('SYSTEM', 454, 28, 27, '#b0b7b8', 4) + rds(459, 43, .65) + label('RDS', 461, 61, 14, '#a4abad', 5) + brand('cdda', 450, 93, 34, 22, '#a3acad');
    s += text('V-DRIVE 60W×4', 108, 110, 10, '#acb5bd', 99, italic) + label('CD RECEIVER', 230, 110, 72, '#9ca8af', 10) + label('CDA-9815RB', 315, 110, 73, '#b9c1c6', 10) + alpine(404, 110, '#b9bec3', 83);
    pane('alpine_9815', 490, 110, s, '', path('M0 96L129 110H490V96Z', 'none', 0, '#080d13'));
}

{
    let s = brand('kenwood', 4, 13, 81, 13, '#d4d6d6') + text('40W×4', 94, 12, 9, '#c8cdce', 38, italic) + text('KRC-759R', 144, 12, 9, '#b9c1c6', 59, italic) + text('CR2-K2i TUNER', 216, 12, 9, '#c8cccf', 87, italic) + frame(325, 4, 56, 8, '#b7c0c6', 0, .6) + label('◧ DOLBY B NR', 328, 10, 50, '#c5cbd1', 5);
    s += rect(7, 81, 27, 14, '#dd9c27', 2) + text('RDS', 9, 92, 11, '#181d0e', 23, italic) + label('DAB', 38, 93, 24, '#343021', 11) + label('MTL', 67, 93, 24, '#083e2c', 11) + label('REG', 96, 93, 25, '#a7b8c4', 11);
    s += label('TP  NEWS', 74, 106, 49, '#3b3d36', 9) + label('DUAL TP', 69, 121, 55, '#073f2f', 11) + rect(7, 103, 36, 14, '#242016', 1) + label('LOUD', 10, 114, 30, '#51411b', 10);
    s += grid(132, 83, 49, 15, 2.8, 2.5, .85, 1, '#122a35');
    s += grid(132, 104, 49, 1, 2.8, 1, .85, 1, '#37463b');
    s += label('TEXT', 286, 94, 28, '#07503b', 11) + frame(286, 98, 29, 11, '#073c2c', 0, .7) + label('TA', 294, 107, 13, '#0d4c36', 9) + rect(286, 113, 29, 9, '#052b20', 2);
    s += path('M324 101L331 106L324 111ZM332 101L339 106L332 111Z', 'none', 0, '#084c36') + label(':IN:', 322, 121, 21, '#07503a', 9);
    s += rds(349, 87, 1.55) + text('R·D·S', 350, 116, 13, '#cbd1d1', 36, italic) + label('RADIO DATA SYSTEM', 349, 123, 36, '#909a9d', 3);
    pane('kenwood_krc', 392, 125, s);
}

{
    let s = '';
    // Perspective grid: true geometry instead of blurred rows sampled from the atlas.
    for (let row = 0; row < 12; row++) {
        const t = row/11, y = 47+Math.pow(t, 1.45)*31, left = 99-76*t, right = 369+76*t;
        for (let col = 0; col < 30; col++) {
            const x = left+(right-left)*col/30, w = (right-left)/30-1.5;
            s += path(`M${n(x)} ${n(y)}H${n(x+w)}L${n(x+w+1)} ${n(y+1.2)}H${n(x-1)}Z`, 'none', 0, '#0b2226');
        }
        s += line(n(left), n(y), n(left+23), n(y), '#87d4e7', 1.35) + line(n(right-23), n(y), n(right), n(y), '#87d4e7', 1.35);
    }
    for (let i = 0; i < 15; i++) s += line(8+i*.9, 64+i*.45, 40+i*.9, 45+i*.45, '#2f1719', 1);
    for (let i = 0; i < 15; i++) s += line(416+i*.9, 45+i*.45, 449+i*.9, 64+i*.45, '#2f1719', 1);
    s += glyph('jvcDisc', 391, 20, 37, 28);
    s += text('BBE', 25, 94, 11, '#0d2419', 23, italic) + rect(24, 82, 29, 14, '#70bba0') + text('BBE', 27, 93, 10, '#10221c', 23, italic) + frame(59, 82, 29, 14, '#74b6a5') + text('Link', 61, 93, 10, '#8acaba', 25, italic);
    s += text('ST', 94, 94, 11, '#99d8c3', 13, italic) + label('EON BANK', 114, 94, 45, '#27532a', 10) + label('AF', 330, 94, 11, '#63c653', 10) + label('SHUFFLE', 350, 94, 36, '#356642', 10) + label('SUB.W', 394, 94, 31, '#9ed6c5', 10) + rect(429, 82, 25, 14, '#83c8b6') + text('T.INFO', 431, 93, 9, '#11261c', 21, italic);
    for (let i=0;i<3;i++) s += line(14+i*3,95,17+i*3,82,'#72bbaa',1.4) + line(455+i,95,451+i,82,'#76bdac',.8);
    pane('jvc_kameleon', 460, 98, s);
}

console.log(process.argv.includes('--check') ? '9 vector faceplates match their editable sources.' : 'Wrote 9 self-contained vector faceplates.');
