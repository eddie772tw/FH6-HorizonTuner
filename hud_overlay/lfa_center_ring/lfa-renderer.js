/* DOM for readings; cached canvas scale and dynamic needle; original raster housing. */
(function (root) {
    'use strict';
    const W = 560, H = 370, CX = 280, CY = 185;
    function create(document, model) {
        const get = (id) => document.getElementById(id);
        const container = get('lfaContainer');
        const scaleCanvas = get('lfaScale'), needleCanvas = get('lfaNeedle');
        const dial = scaleCanvas.getContext('2d'), needle = needleCanvas.getContext('2d');
        const nodes = {};
        ['Speed', 'SpeedUnit', 'Gear', 'Status', 'Throttle', 'Brake', 'ThrottleBar', 'BrakeBar', 'SelfCheck'].forEach((n) => { nodes[n] = get('lfa' + n); });
        let colors, dialKey = '', lastNeedle = '', ratio = 2;
        function setText(name, value) { if (nodes[name].textContent !== value) nodes[name].textContent = value; }
        function palette(settings) {
            const css = root.getComputedStyle(container);
            const color = (name) => css.getPropertyValue('--lfa-' + name).trim();
            colors = { primary: color('primary'), secondary: color('secondary'), dim: color('dim'), red: color('red'), accent: settings.accent };
            container.style.setProperty('--lfa-accent', settings.accent);
            dialKey = ''; lastNeedle = '';
        }
        function resize() {
            ratio = Math.max(1, Math.min(3, root.devicePixelRatio || 1));
            [scaleCanvas, needleCanvas].forEach((canvas) => {
                canvas.width = Math.round(W * ratio); canvas.height = Math.round(H * ratio);
            });
            dialKey = ''; lastNeedle = '';
        }
        function prepare(ctx) {
            if (!ctx) return false;
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            ctx.clearRect(0, 0, W, H);
            return true;
        }
        function line(ctx, angle, inner, outer, width, color) {
            ctx.beginPath(); ctx.moveTo(CX + Math.cos(angle) * inner, CY + Math.sin(angle) * inner);
            ctx.lineTo(CX + Math.cos(angle) * outer, CY + Math.sin(angle) * outer);
            ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
        }
        function drawScale(v) {
            const key = [v.dial.maximum, v.redline, colors.accent].join(':');
            if (key === dialKey || !prepare(dial)) return;
            dialKey = key;
            dial.textAlign = 'center'; dial.textBaseline = 'middle';
            for (let i = 0; i <= 50; i++) {
                const value = v.dial.maximum * i / 50;
                const a = model.angle(value, v.dial.maximum);
                const hot = v.redline !== null && value >= v.redline;
                line(dial, a, i % 5 === 0 ? 133 : 139, 145, i % 5 === 0 ? 2 : .8, hot ? colors.red : colors.secondary);
            }
            if (v.redline !== null) {
                dial.beginPath(); dial.arc(CX, CY, 149, model.angle(v.redline, v.dial.maximum), model.angle(v.dial.maximum, v.dial.maximum));
                dial.lineWidth = 5; dial.strokeStyle = colors.red; dial.stroke();
            }
            dial.font = '500 24px Arial, sans-serif';
            v.dial.ticks.forEach((value) => {
                const a = model.angle(value, v.dial.maximum);
                const label = Number((value / 1000).toFixed(1)).toString();
                dial.fillStyle = v.redline !== null && value >= v.redline ? colors.red : colors.primary;
                dial.fillText(label, CX + Math.cos(a) * 118, CY + Math.sin(a) * 118);
            });
        }
        function drawNeedle(v, check, settings) {
            const key = [v.needle, v.shift, check, settings.glow].join(':');
            if (key === lastNeedle || !prepare(needle)) return;
            lastNeedle = key;
            if (check !== null) {
                needle.beginPath(); needle.arc(CX, CY, 169, -Math.PI / 2, -Math.PI / 2 + check * Math.PI * 2);
                needle.strokeStyle = colors.accent; needle.lineWidth = 1.8; needle.stroke();
            }
            if (v.needle === null) return;
            needle.save(); needle.translate(CX, CY); needle.rotate(v.needle);
            needle.shadowColor = v.shift ? colors.red : colors.accent;
            needle.shadowBlur = settings.glow * 5;
            needle.fillStyle = v.shift ? colors.red : colors.accent;
            needle.beginPath(); needle.moveTo(150, 0); needle.lineTo(100, -2.1); needle.lineTo(100, 2.1); needle.closePath(); needle.fill();
            needle.restore();
        }
        function render(v, check, settings) {
            drawScale(v); drawNeedle(v, check, settings);
            setText('Speed', v.speedText); setText('SpeedUnit', v.speedUnit); setText('Gear', v.gear);
            setText('Status', v.shift ? 'SHIFT' : v.status);
            [['Throttle', v.throttle], ['Brake', v.brake]].forEach(([name, value]) => {
                setText(name, value === null ? '—' : String(Math.round(value * 100)));
                nodes[name + 'Bar'].style.transform = 'scaleX(' + (value ?? 0) + ')';
            });
            nodes.SelfCheck.hidden = check === null;
            container.dataset.state = v.shift ? 'warning' : v.live ? 'live' : 'offline';
        }
        function visibility(show) { container.style.display = show ? 'block' : 'none'; }
        return { palette, resize, render, visibility };
    }
    root.LfaRenderer = { create };
})(window);
