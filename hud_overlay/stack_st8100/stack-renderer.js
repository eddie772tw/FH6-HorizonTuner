/* Original Canvas artwork, based on documented ST8100 proportions, not copied assets. */
(function (root) {
    'use strict';
    const M = root.StackModel, Dots = root.StackDots;
    const WIDTH = 640, HEIGHT = 380, CX = 320, CY = 190, R = 139, LCD_X = 81, LCD_Y = 275, LCD_W = 478, LCD_H = 66;
    function text(ctx, value, x, y, size, color, align) {
        ctx.font = '500 ' + size + 'px Arial, sans-serif'; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = color; ctx.fillText(value, x, y);
    }
    function shell(ctx) {
        ctx.beginPath(); ctx.moveTo(29, 361); ctx.quadraticCurveTo(13, 361, 13, 343);
        ctx.lineTo(13, 217); ctx.quadraticCurveTo(13, 199, 27, 192);
        ctx.lineTo(264, 35); ctx.quadraticCurveTo(320, -2, 376, 35);
        ctx.lineTo(613, 192); ctx.quadraticCurveTo(627, 199, 627, 217);
        ctx.lineTo(627, 343); ctx.quadraticCurveTo(627, 361, 610, 361); ctx.closePath();
    }
    function tick(ctx, a, len) {
        const cos = Math.cos(a), sin = Math.sin(a);
        ctx.moveTo(CX + cos * R, CY + sin * R); ctx.lineTo(CX + cos * (R - len), CY + sin * (R - len));
    }
    function staticDial(ctx, scale, color, white) {
        ctx.save(); try { paintStaticDial(ctx, scale, color, white); } finally { ctx.restore(); }
    }
    function paintStaticDial(ctx, scale, color, white) {
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        shell(ctx); ctx.fillStyle = color.shell; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = color.edge; ctx.stroke();
        ctx.save(); try { ctx.translate(CX, 182); ctx.scale(.958, .935); ctx.translate(-CX, -182);
            shell(ctx); ctx.fillStyle = white ? color.whiteFace : color.face; ctx.fill(); ctx.strokeStyle = color.inset; ctx.lineWidth = 2; ctx.stroke();
        } finally { ctx.restore(); }
        // Batch minor and major dial ticks into two paths while preserving exact scale geometry.
        const tickColor = white ? color.whiteTick : color.tick;
        ctx.strokeStyle = tickColor; ctx.lineWidth = 1.25; ctx.beginPath();
        for (let rpm = 0; rpm <= scale.max; rpm += 200) if (rpm % 1000 !== 0) tick(ctx, M.angle(rpm, scale), rpm % 500 === 0 ? 14 : 10);
        ctx.stroke();
        ctx.lineWidth = 2.5; ctx.beginPath();
        for (let rpm = 0; rpm <= scale.max; rpm += 1000) tick(ctx, M.angle(rpm, scale), 19);
        if (scale.max === 10500) tick(ctx, M.angle(10500, scale), 19);
        ctx.stroke();
        for (let rpm = 0; rpm <= scale.max; rpm += 1000) {
            const a = M.angle(rpm, scale), small = rpm < scale.knee;
            text(ctx, String(rpm / 1000), CX + Math.cos(a) * (R - 32), CY + Math.sin(a) * (R - 32), small ? (scale.knee >= 6000 ? 9 : 12) : 23, tickColor);
        }
        if (scale.max === 10500) { const end = M.angle(10500, scale); text(ctx, '10.5', CX + Math.cos(end) * (R - 32), CY + Math.sin(end) * (R - 32), 15, tickColor); }
        text(ctx, 'kRPM', CX, CY + 55, 10, white ? color.whiteMuted : color.muted);
        ctx.fillStyle = color.recess; ctx.fillRect(LCD_X, LCD_Y, LCD_W, LCD_H);
        ctx.strokeStyle = color.lcdEdge; ctx.lineWidth = 3; ctx.strokeRect(LCD_X, LCD_Y, LCD_W, LCD_H);
    }
    function palette(styles) {
        const read = name => styles.getPropertyValue('--stack-' + name).trim();
        return { whiteFace: read('white-face'), whiteTick: read('white-tick'), whiteMuted: read('white-muted'), shell: read('shell'), edge: read('edge'), inset: read('inset'), face: read('face'), tick: read('tick'), muted: read('muted'),
            needle: read('needle'), hub: read('hub'), recess: read('recess'), lcd: read('lcd'), lcdEdge: read('lcd-edge'), ink: read('ink'),
            dot: read('dot'), alarm: read('alarm'), shift: read('shift'), lampOff: read('lamp-off') };
    }
    function makeSurface(doc, w, h) { const c = doc.createElement('canvas'); c.width = w; c.height = h; return c; }
    function scaleSurface(c, ctx, w, h, ratio) { c.width = w; c.height = h; ctx?.setTransform(ratio, 0, 0, ratio, 0, 0); }
    function create(canvas, document, colors) {
        const ctx = canvas.getContext('2d'), backing = makeSurface(document, WIDTH, HEIGHT);
        const lcd = makeSurface(document, LCD_W, LCD_H), lcdBg = makeSurface(document, LCD_W, LCD_H);
        return { canvas, ctx, backing, backingCtx: backing.getContext('2d'), lcd, lcdCtx: lcd.getContext('2d'),
            lcdBg, lcdBgCtx: lcdBg.getContext('2d'), colors, dialId: null, lcdBgReady: false, dpr: 0, lastLCD: -Infinity,
            cell: { label: '', value: '' }, row1: '', row2: '', lastStatus: null, lastWarning: null };
    }
    function resize(r, dpr) {
        const ratio = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 3) : 1;
        if (r.dpr === ratio) return;
        r.dpr = ratio;
        const w = Math.round(WIDTH * ratio), h = Math.round(HEIGHT * ratio), lw = Math.round(LCD_W * ratio), lh = Math.round(LCD_H * ratio);
        scaleSurface(r.canvas, r.ctx, w, h, ratio); scaleSurface(r.backing, r.backingCtx, w, h, ratio);
        scaleSurface(r.lcd, r.lcdCtx, lw, lh, ratio); scaleSurface(r.lcdBg, r.lcdBgCtx, lw, lh, ratio);
        r.dialId = null; r.lcdBgReady = false; r.lastLCD = -Infinity;
    }
    function ensureLcdBg(r) {
        if (r.lcdBgReady) return;
        const ctx = r.lcdBgCtx, c = r.colors;
        ctx.save(); try {
            ctx.fillStyle = c.lcd; ctx.fillRect(0, 0, LCD_W, LCD_H); ctx.fillStyle = c.dot;
            for (let x = 2; x < LCD_W; x += 2.5) for (let y = 2; y < LCD_H; y += 2.5) ctx.fillRect(x, y, 1.5, 1.5);
        } finally { ctx.restore(); }
        r.lcdBgReady = true;
    }
    function lamp(ctx, x, y, on, color, colors, glow, label, white, dpr) {
        ctx.save(); try {
            ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(x, y, 10.8, 0, Math.PI * 2); ctx.fillStyle = colors.recess; ctx.fill();
            ctx.beginPath(); ctx.arc(x, y, 7.695, 0, Math.PI * 2); ctx.fillStyle = on ? color : colors.lampOff;
            ctx.shadowColor = color; ctx.shadowBlur = on ? 9 * glow * dpr : 0; ctx.fill(); ctx.shadowBlur = 0;
            text(ctx, label, x, y + 23, 8, white ? colors.whiteMuted : colors.muted);
        } finally { ctx.restore(); }
    }
    function line(ctx, value, x, y, pitch, ink) { Dots.draw(ctx, value, x, y, pitch, ink); }
    function lcdCell(r, index, label, value) {
        if (index < 2) r.row1 += (index ? ' | ' : '') + label + ' ' + value;
        else r.row2 += (index === 3 ? ' | ' : '') + label + ' ' + value;
        const ctx = r.lcdCtx, x = index % 2 === 0 ? 12 : 251, y = index < 2 ? 10 : 37, pitch = 2.5;
        const labelWidth = Dots.width(label, pitch), valueWidth = Dots.width(value, pitch);
        // Long lap values use a smaller pitch within their own cell, never overflow the next one.
        const fitted = labelWidth + valueWidth + 9 > 213 ? Math.min(pitch, 213 / ((label.length + value.length) * 6 + 2)) : pitch;
        line(ctx, label, x, y + (2.5 - fitted) * 3, fitted, r.colors.ink);
        line(ctx, value, x + 213 - Dots.width(value, fitted), y + (2.5 - fitted) * 3, fitted, r.colors.ink);
    }
    function updateLCD(r, s, now, sweep) {
        const phaseKey = s.display.phase + ':' + s.display.info + ':' + s.display.alarmIndex;
        if (r.phaseKey === phaseKey && now - r.lastLCD < 100 && r.lastStatus === s.status && r.lastWarning === s.warning && !sweep && r.lcdBgReady) return;
        ensureLcdBg(r);
        r.phaseKey = phaseKey; r.lastLCD = now; r.lastStatus = s.status; r.lastWarning = s.warning; r.row1 = ''; r.row2 = '';
        r.lcdCtx.save(); try { paintLCD(r, s, sweep); } finally { r.lcdCtx.restore(); }
    }
    function paintLCD(r, s, sweep) {
        const ctx = r.lcdCtx, c = r.colors, settings = s.settings;
        ctx.drawImage(r.lcdBg, 0, 0, LCD_W, LCD_H);
        if (sweep) { r.row1 = 'DISPLAY CHECK'; r.row2 = 'NO LIVE SENSOR VALUES'; line(ctx, 'ST8100 DISPLAY CHECK', 90, 11, 2.5, c.ink); line(ctx, 'NO LIVE SENSOR VALUES', 80, 37, 2.5, c.ink); return; }
        if (s.status !== 'LIVE') { r.row1 = s.status; r.row2 = 'TELEMETRY --'; line(ctx, s.status, (478 - Dots.width(s.status, 2.5)) / 2, 12, 2.5, c.ink); line(ctx, 'TELEMETRY --', 156, 38, 2.5, c.ink); return; }
        if (s.display.phase === 'alarm' || s.display.phase === 'lap') {
            if (s.display.phase === 'lap') { r.row1 = 'LAST LAP'; r.row2 = M.formatLap(s.display.popupLap); }
            else { M.alarmField(s, s.display.alarmIndex, r.cell); r.row1 = r.cell.label; r.row2 = r.cell.value; }
            line(ctx, r.row1, (478 - Dots.width(r.row1, 2.5)) / 2, 10, 2.5, c.ink);
            line(ctx, r.row2, (478 - Dots.width(r.row2, 2.5)) / 2, 37, 2.5, c.ink); return;
        }
        if (!settings.showLCD) return;
        if (s.display.info === 'timing') {
            M.field('current_lap', s, r.cell); lcdCell(r, 0, r.cell.label, r.cell.value);
            M.field('best_lap', s, r.cell); lcdCell(r, 1, r.cell.label, r.cell.value);
            M.field('last_lap', s, r.cell); lcdCell(r, 2, r.cell.label, r.cell.value);
            M.field('position', s, r.cell); lcdCell(r, 3, r.cell.label, r.cell.value);
        } else if (settings.stackSt8100Page === 'peaks') {
            M.field('peak_rpm', s, r.cell); lcdCell(r, 0, r.cell.label, r.cell.value);
            M.field('peak_speed', s, r.cell); lcdCell(r, 1, r.cell.label, r.cell.value);
            lcdCell(r, 2, 'MAX BST', s.peakBoostBar === null ? '--' : M.pressure(s.peakBoostBar, settings).toFixed(settings.boostUnit === 'bar' ? 2 : 1));
            lcdCell(r, 3, 'MAX ' + settings.stackSt8100TemperatureUnit.toUpperCase(), s.peakTireC === null ? '--' : String(Math.round(M.temperature(s.peakTireC, settings))));
        } else {
            for (let i = 0; i < 4; i++) { M.field(settings['stackSt8100Field' + (i + 1)], s, r.cell); lcdCell(r, i, r.cell.label, r.cell.value); }
        }
    }
    function paintFrame(r, s, scale, live, rpm, dpr, now, sweep, sweepProgress) {
        const ctx = r.ctx, c = r.colors;
        ctx.clearRect(0, 0, WIDTH, HEIGHT); ctx.shadowBlur = 0; ctx.drawImage(r.backing, 0, 0, WIDTH, HEIGHT);
        if (s.settings.showRPM && rpm !== null) {
            ctx.save(); try { ctx.translate(CX, CY); ctx.rotate(M.angle(rpm, scale));
                ctx.beginPath(); ctx.moveTo(-26, -2.2); ctx.lineTo(R - 7, -.8); ctx.lineTo(R - 7, .8); ctx.lineTo(-26, 2.2); ctx.closePath();
                ctx.fillStyle = s.settings.accent || c.needle; ctx.shadowColor = s.settings.accent || c.needle; ctx.shadowBlur = s.settings.glow * 2 * dpr; ctx.fill();
            } finally { ctx.restore(); }
        }
        ctx.beginPath(); ctx.arc(CX, CY, 12, 0, Math.PI * 2); ctx.fillStyle = c.hub; ctx.fill(); ctx.strokeStyle = c.inset; ctx.lineWidth = 2; ctx.stroke();
        lamp(ctx, 154, 195, !sweep && live && Boolean(s.warning), c.alarm, c, s.settings.glow, 'ALARM', s.settings.stackSt8100Face === 'white', dpr);
        lamp(ctx, 486, 195, sweep ? sweepProgress > .9 : live && s.shift, c.shift, c, s.settings.glow, 'SHIFT', s.settings.stackSt8100Face === 'white', dpr);
        updateLCD(r, s, now, sweep); ctx.drawImage(r.lcd, LCD_X, LCD_Y, LCD_W, LCD_H);
        if (live && s.latest.rpm > scale.max) text(ctx, 'RPM > ' + scale.max, CX, CY + 76, 10, c.alarm);
        if (s.settings.stackSt8100Page === 'peaks' && live && s.display.phase === 'info' && s.display.info === 'base') text(ctx, 'TELL-TALES', CX, 353, 8, s.settings.stackSt8100Face === 'white' ? c.whiteMuted : c.muted);
    }
    function draw(r, s, now, sweepProgress) {
        if (!r.ctx || !r.backingCtx || !r.lcdCtx || !r.lcdBgCtx) return;
        const scale = M.dial(s.settings, s.latest.maxRpm), sweep = sweepProgress !== null;
        const dpr = r.dpr || 1, live = s.status === 'LIVE', rpm = sweep ? sweepProgress * scale.max : live ? s.visualRpm : null;
        const faceKey = scale.id + ':' + s.settings.stackSt8100Face;
        if (r.dialId !== faceKey) { staticDial(r.backingCtx, scale, r.colors, s.settings.stackSt8100Face === 'white'); r.dialId = faceKey; }
        r.ctx.save(); try { paintFrame(r, s, scale, live, rpm, dpr, now, sweep, sweepProgress); } finally { r.ctx.restore(); }
        const caption = 'ST8100 inspired; ' + s.status + '; ' + r.row1 + '; ' + r.row2;
        if (r.canvas.getAttribute('aria-label') !== caption) r.canvas.setAttribute('aria-label', caption);
        r.canvas.dataset.phase = s.display.phase; r.canvas.dataset.page = s.display.info;
        r.canvas.dataset.face = s.settings.stackSt8100Face; r.canvas.dataset.alarmSlot = s.display.alarmIndex === null ? '' : String(s.display.alarmIndex + 1);
        r.canvas.dataset.status = s.status; r.canvas.dataset.warning = s.warning || '';
        r.canvas.dataset.shift = String(live && s.shift); r.canvas.dataset.dial = scale.id;
        r.canvas.dataset.rpm = live && s.latest.rpm !== null ? String(Math.round(s.latest.rpm)) : '--';
        r.canvas.dataset.lcd1 = r.row1; r.canvas.dataset.lcd2 = r.row2;
    }
    root.StackRenderer = { WIDTH, HEIGHT, palette, create, resize, draw };
})(typeof window === 'undefined' ? globalThis : window);
