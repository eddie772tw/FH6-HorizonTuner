/* Original Canvas artwork, based on documented ST8100 proportions, not copied assets. */
(function (root) {
    'use strict';
    const M = root.StackModel, Dots = root.StackDots;
    const WIDTH = 640, HEIGHT = 380, CX = 320, CY = 190, R = 139;
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
    function staticDial(ctx, scale, color) {
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        shell(ctx); ctx.fillStyle = color.shell; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = color.edge; ctx.stroke();
        ctx.save(); ctx.translate(CX, 182); ctx.scale(.958, .935); ctx.translate(-CX, -182);
        shell(ctx); ctx.fillStyle = color.face; ctx.fill(); ctx.strokeStyle = color.inset; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
        // The shoulder lamps sit at either side of the tach, as on the physical module.
        for (let rpm = 0; rpm <= scale.max; rpm += 200) {
            const angle = M.angle(rpm, scale), major = rpm % 1000 === 0;
            const length = major ? 19 : rpm % 500 === 0 ? 14 : 10;
            ctx.beginPath(); ctx.moveTo(CX + Math.cos(angle) * R, CY + Math.sin(angle) * R);
            ctx.lineTo(CX + Math.cos(angle) * (R - length), CY + Math.sin(angle) * (R - length));
            ctx.strokeStyle = color.tick; ctx.lineWidth = major ? 2.5 : 1.25; ctx.stroke();
            if (major) {
                const small = rpm < scale.knee;
                text(ctx, String(rpm / 1000), CX + Math.cos(angle) * (R - 32), CY + Math.sin(angle) * (R - 32), small ? (scale.knee >= 6000 ? 9 : 12) : 23, color.tick);
            }
        }
        text(ctx, 'kRPM', CX, CY + 55, 10, color.muted);
        text(ctx, 'ST8100', 565, 305, 12, color.muted);
        text(ctx, 'INSPIRED', 565, 320, 7, color.muted);
        ctx.fillStyle = color.recess; ctx.fillRect(55, 275, 478, 66);
        ctx.strokeStyle = color.lcdEdge; ctx.lineWidth = 3; ctx.strokeRect(55, 275, 478, 66);
    }
    function palette(styles) {
        const read = name => styles.getPropertyValue('--stack-' + name).trim();
        return { shell: read('shell'), edge: read('edge'), inset: read('inset'), face: read('face'), tick: read('tick'), muted: read('muted'),
            needle: read('needle'), hub: read('hub'), recess: read('recess'), lcd: read('lcd'), lcdEdge: read('lcd-edge'), ink: read('ink'),
            dot: read('dot'), alarm: read('alarm'), shift: read('shift'), lampOff: read('lamp-off') };
    }
    function create(canvas, document, colors) {
        const ctx = canvas.getContext('2d');
        const backing = document.createElement('canvas'); backing.width = WIDTH; backing.height = HEIGHT;
        const backingCtx = backing.getContext('2d');
        const lcd = document.createElement('canvas'); lcd.width = 478; lcd.height = 66;
        const lcdCtx = lcd.getContext('2d');
        return { canvas, ctx, backing, backingCtx, lcd, lcdCtx, colors, dialId: null, dpr: 0, lastLCD: -Infinity,
            cell: { label: '', value: '' }, row1: '', row2: '', lastStatus: null, lastWarning: null };
    }
    function resize(r, dpr) {
        const ratio = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 3) : 1;
        if (r.dpr === ratio) return;
        r.dpr = ratio; r.canvas.width = Math.round(WIDTH * ratio); r.canvas.height = Math.round(HEIGHT * ratio);
        r.ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
        r.backing.width = Math.round(WIDTH * ratio); r.backing.height = Math.round(HEIGHT * ratio);
        r.backingCtx?.setTransform(ratio, 0, 0, ratio, 0, 0); r.dialId = null;
    }
    function lamp(ctx, x, y, on, color, colors, glow, label) {
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fillStyle = colors.recess; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 5.7, 0, Math.PI * 2); ctx.fillStyle = on ? color : colors.lampOff;
        ctx.shadowColor = color; ctx.shadowBlur = on ? 9 * glow : 0; ctx.fill(); ctx.shadowBlur = 0;
        text(ctx, label, x, y + 19, 8, colors.muted);
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
        if (now - r.lastLCD < 100 && r.lastStatus === s.status && r.lastWarning === s.warning && !sweep) return;
        r.lastLCD = now; r.lastStatus = s.status; r.lastWarning = s.warning;
        const ctx = r.lcdCtx, c = r.colors, settings = s.settings;
        r.row1 = ''; r.row2 = '';
        ctx.fillStyle = c.lcd; ctx.fillRect(0, 0, 478, 66);
        ctx.fillStyle = c.dot;
        for (let x = 2; x < 478; x += 2.5) for (let y = 2; y < 66; y += 2.5) ctx.fillRect(x, y, 1.5, 1.5);
        if (sweep) { r.row1 = 'DISPLAY CHECK'; r.row2 = 'NO LIVE SENSOR VALUES'; line(ctx, 'ST8100 DISPLAY CHECK', 90, 11, 2.5, c.ink); line(ctx, 'NO LIVE SENSOR VALUES', 80, 37, 2.5, c.ink); return; }
        if (s.status !== 'LIVE') { r.row1 = s.status; r.row2 = 'TELEMETRY --'; line(ctx, s.status, (478 - Dots.width(s.status, 2.5)) / 2, 12, 2.5, c.ink); line(ctx, 'TELEMETRY --', 156, 38, 2.5, c.ink); return; }
        if (s.warning) {
            const title = s.warning === 'tire' ? 'HIGH TYRE TEMP' : s.warning === 'boost' ? 'HIGH BOOST' : 'LOW FUEL';
            const value = s.warning === 'tire' ? Math.round(M.temperature(s.latest.tireMaxC, settings)) + ' ' + settings.stackSt8100TemperatureUnit.toUpperCase()
                : s.warning === 'boost' ? M.pressure(s.latest.boostBar, settings).toFixed(settings.boostUnit === 'bar' ? 2 : 1) + ' ' + settings.boostUnit.toUpperCase()
                    : Math.round(s.latest.fuel) + ' %';
            r.row1 = title; r.row2 = value;
            line(ctx, title, (478 - Dots.width(title, 2.5)) / 2, 10, 2.5, c.ink);
            line(ctx, value, (478 - Dots.width(value, 2.5)) / 2, 37, 2.5, c.ink); return;
        }
        if (!settings.showLCD) return;
        if (settings.stackSt8100Page === 'peaks') {
            M.field('peak_rpm', s, r.cell); lcdCell(r, 0, r.cell.label, r.cell.value);
            M.field('peak_speed', s, r.cell); lcdCell(r, 1, r.cell.label, r.cell.value);
            lcdCell(r, 2, 'MIN FUEL', s.minFuel === null ? '--' : Math.round(s.minFuel) + '%');
            lcdCell(r, 3, 'MAX ' + settings.stackSt8100TemperatureUnit.toUpperCase(), s.peakTireC === null ? '--' : String(Math.round(M.temperature(s.peakTireC, settings))));
        } else {
            for (let i = 0; i < 4; i++) { M.field(settings['stackSt8100Field' + (i + 1)], s, r.cell); lcdCell(r, i, r.cell.label, r.cell.value); }
        }
    }
    function draw(r, s, now, sweepProgress) {
        if (!r.ctx || !r.backingCtx || !r.lcdCtx) return;
        const scale = M.dial(s.settings, s.latest.maxRpm), ctx = r.ctx, c = r.colors, sweep = sweepProgress !== null;
        if (r.dialId !== scale.id) { staticDial(r.backingCtx, scale, c); r.dialId = scale.id; }
        ctx.clearRect(0, 0, WIDTH, HEIGHT); ctx.drawImage(r.backing, 0, 0, WIDTH, HEIGHT);
        const live = s.status === 'LIVE', rpm = sweep ? sweepProgress * scale.max : live ? s.visualRpm : null;
        if (s.settings.showRPM && rpm !== null) {
            ctx.save(); ctx.translate(CX, CY); ctx.rotate(M.angle(rpm, scale));
            ctx.beginPath(); ctx.moveTo(-26, -2.2); ctx.lineTo(R - 7, -.8); ctx.lineTo(R - 7, .8); ctx.lineTo(-26, 2.2); ctx.closePath();
            ctx.fillStyle = s.settings.accent || c.needle; ctx.shadowColor = s.settings.accent || c.needle; ctx.shadowBlur = s.settings.glow * 2; ctx.fill(); ctx.restore();
        }
        ctx.beginPath(); ctx.arc(CX, CY, 12, 0, Math.PI * 2); ctx.fillStyle = c.hub; ctx.fill(); ctx.strokeStyle = c.inset; ctx.lineWidth = 2; ctx.stroke();
        lamp(ctx, 154, 195, !sweep && live && Boolean(s.warning), c.alarm, c, s.settings.glow, 'ALARM');
        lamp(ctx, 486, 195, sweep ? sweepProgress > .9 : live && s.shift, c.shift, c, s.settings.glow, 'SHIFT');
        updateLCD(r, s, now, sweep); ctx.drawImage(r.lcd, 55, 275);
        const caption = 'ST8100 inspired; ' + s.status + '; ' + r.row1 + '; ' + r.row2;
        if (r.canvas.getAttribute('aria-label') !== caption) r.canvas.setAttribute('aria-label', caption);
        r.canvas.dataset.status = s.status; r.canvas.dataset.warning = s.warning || '';
        r.canvas.dataset.shift = String(live && s.shift); r.canvas.dataset.dial = scale.id;
        r.canvas.dataset.rpm = live && s.latest.rpm !== null ? String(Math.round(s.latest.rpm)) : '--';
        r.canvas.dataset.lcd1 = r.row1; r.canvas.dataset.lcd2 = r.row2;
        if (live && s.latest.rpm > scale.max) text(ctx, 'RPM > ' + scale.max, CX, CY + 76, 10, c.alarm);
        if (s.settings.stackSt8100Page === 'peaks' && live && !s.warning) text(ctx, 'TELL-TALES', CX, 353, 8, c.muted);
    }
    root.StackRenderer = { WIDTH, HEIGHT, palette, create, resize, draw };
})(typeof window === 'undefined' ? globalThis : window);
