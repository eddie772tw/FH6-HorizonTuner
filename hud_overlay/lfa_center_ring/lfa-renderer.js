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
        ['Speed', 'SpeedUnit', 'Gear', 'Status', 'Tire', 'TireFill', 'TireGauge', 'Boost', 'BoostUnit', 'BoostMode', 'BoostFill', 'BoostGauge', 'Throttle', 'ThrottleFill', 'ThrottleGauge', 'Brake', 'BrakeFill', 'BrakeGauge', 'LapTime', 'SelfCheck'].forEach((n) => { nodes[n] = get('lfa' + n); });
        for (const name of ['Tire', 'Boost']) for (let i = 0; i < 4; i++) nodes[name + 'Tick' + i] = get('lfa' + name + 'Tick' + i);
        for (let i = 0; i < 4; i++) nodes['BoostMark' + i] = get('lfaBoostMark' + i);
        ['MovingCenter', 'CollapsedFascia', 'CollapsedReadings', 'ExpandedPane', 'ExpandedCurrent', 'ExpandedLast', 'ExpandedBest', 'ExpandedTire', 'ExpandedBoost', 'ExpandedBoostLabel', 'ExpandedThrottle', 'ExpandedBrake'].forEach(name => { nodes[name] = get('lfa' + name); });
        let colors, dialKey = '', lastNeedle = '', ratio = 2;
        let boostTicksKey = '';
        let layoutKey = '';
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
            const extendedScale = v.dial.maximum > 10000;
            for (let i = 0; i <= 50; i++) {
                const value = v.dial.maximum * i / 50;
                const a = model.angle(value, v.dial.maximum);
                const hot = v.redline !== null && value >= v.redline;
                line(dial, a, i % 5 === 0 && !extendedScale ? 133 : 139, 145, i % 5 === 0 ? 2 : .8, hot ? colors.red : colors.secondary);
            }
            if (v.redline !== null) {
                dial.beginPath(); dial.arc(CX, CY, 149, model.angle(v.redline, v.dial.maximum), model.angle(v.dial.maximum, v.dial.maximum));
                dial.lineWidth = 5; dial.strokeStyle = colors.red; dial.stroke();
            }
            dial.font = '500 ' + (extendedScale ? 20 : 24) + 'px Arial, sans-serif';
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
        function positionBoostTicks(fractions) {
            const key = fractions.join(':');
            if (key === boostTicksKey) return;
            boostTicksKey = key;
            const length = nodes.BoostFill.getTotalLength();
            fractions.forEach((fraction, i) => {
                const point = nodes.BoostFill.getPointAtLength(length * fraction), mark = nodes['BoostMark' + i];
                mark.setAttribute('x1', point.x); mark.setAttribute('y1', point.y);
                mark.setAttribute('x2', point.x - 9); mark.setAttribute('y2', point.y);
                nodes['BoostTick' + i].setAttribute('x', point.x - 12);
                nodes['BoostTick' + i].setAttribute('y', point.y + 4);
            });
        }
        function expandedLayout(v, motion) {
            const progress = motion?.progress ?? 0, target = motion?.target === true, settled = motion?.settled !== false;
            const key = [progress, target, settled].join(':');
            if (key !== layoutKey) {
                layoutKey = key;
                // No transform/compositor layer remains on the settled approved collapsed face.
                nodes.MovingCenter.style.transform = progress === 0 ? 'none' : 'translateX(' + progress * 96 + 'px)';
                const wings = Math.max(0, 1 - progress * 4);
                for (const node of [nodes.CollapsedFascia, nodes.CollapsedReadings]) {
                    node.style.opacity = wings === 1 ? '' : String(wings);
                    node.style.visibility = progress === 1 ? 'hidden' : '';
                }
                nodes.CollapsedReadings.setAttribute('aria-hidden', String(progress === 1));
                nodes.ExpandedPane.style.display = progress === 0 ? 'none' : '';
                nodes.ExpandedPane.style.opacity = String(Math.max(0, Math.min(1, (progress - .18) / .5)));
                nodes.ExpandedPane.setAttribute('aria-hidden', String(progress === 0));
                container.dataset.expanded = String(target);
                container.dataset.expansionSettled = String(settled);
                container.dataset.expansionProgress = String(progress);
            }
            if (progress === 0) return;
            const a = v.auxiliary;
            setText('ExpandedCurrent', v.lapText);
            setText('ExpandedLast', root.LfaSession.formatLap(v.race.lastLap));
            setText('ExpandedBest', root.LfaSession.formatLap(v.race.bestLap));
            setText('ExpandedTire', a.tireText === 'N/A' ? 'N/A' : a.tireText + a.temperatureUnit);
            setText('ExpandedBoost', a.boostText === 'N/A' ? 'N/A' : a.boostText + ' ' + a.boostUnit);
            setText('ExpandedBoostLabel', a.boostNegative ? 'VAC' : 'BOOST');
            nodes.ExpandedBoost.dataset.negative = nodes.ExpandedBoostLabel.dataset.negative = String(a.boostNegative);
            setText('ExpandedThrottle', a.throttleText); setText('ExpandedBrake', a.brakeText);
        }
        function render(v, check, settings, motion) {
            drawScale(v); drawNeedle(v, check, settings);
            expandedLayout(v, motion);
            setText('Speed', v.speedText); setText('SpeedUnit', v.speedUnit); setText('Gear', v.gear);
            setText('Status', v.centerText);
            const a = v.auxiliary;
            setText('Tire', a.tireText === 'N/A' ? 'N/A' : a.tireText + a.temperatureUnit);
            setText('Boost', a.boostText); setText('BoostUnit', a.boostUnit);
            setText('BoostMode', a.boostNegative ? 'VAC' : '');
            positionBoostTicks(a.boostTickFractions);
            setText('Throttle', a.throttleText); setText('Brake', a.brakeText); setText('LapTime', v.lapText);
            for (let i = 0; i < 4; i++) {
                setText('TireTick' + i, a.temperatureTicks[i] + (i === 3 ? a.temperatureUnit : ''));
                setText('BoostTick' + i, a.boostTicks[i]);
            }
            for (const [name, fraction, value] of [['Tire', a.tireFraction, a.tireText + a.temperatureUnit], ['Boost', a.boostFraction, a.boostText + ' ' + a.boostUnit], ['Throttle', a.throttle, a.throttleText], ['Brake', a.brake, a.brakeText]]) {
                nodes[name + 'Fill'].style.strokeDasharray = (fraction ?? 0) * 100 + ' 100';
                nodes[name + 'Fill'].style.opacity = fraction === null ? '0' : '1';
                nodes[name + 'Gauge'].setAttribute('aria-label', fraction === null ? name + ' unavailable' : name + ' ' + value);
            }
            if (a.boostNegative) nodes.BoostGauge.setAttribute('aria-label', 'Vacuum ' + a.boostText + ' ' + a.boostUnit);
            nodes.TireFill.dataset.band = a.tireBand;
            nodes.BoostFill.dataset.negative = String(a.boostNegative);
            nodes.SelfCheck.hidden = check === null;
            container.dataset.state = v.shift ? 'warning' : v.live ? 'live' : 'offline';
        }
        function visibility(show) { container.style.display = show ? 'block' : 'none'; }
        return { palette, resize, render, visibility };
    }
    root.LfaRenderer = { create };
})(window);
