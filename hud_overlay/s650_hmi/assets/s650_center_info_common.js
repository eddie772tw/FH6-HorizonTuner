/* Shared drawing helpers for S650 center-information pages. */
(function (window) {
    'use strict';

    function number(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function read(data, keys, fallback) {
        var source = data || {};
        for (var index = 0; index < keys.length; index += 1) {
            if (source[keys[index]] !== undefined && source[keys[index]] !== null) {
                return source[keys[index]];
            }
        }
        return fallback;
    }

    function getFontSize(context, role, fallback) {
        var primitives = context.primitives || {};
        if (typeof primitives.getFontSize === 'function') {
            return primitives.getFontSize(context.view, role, fallback);
        }
        return fallback;
    }

    function setFont(context, role, size, weight) {
        var primitives = context.primitives || {};
        if (typeof primitives.setFont === 'function') {
            primitives.setFont(getFontSize(context, role, size), weight || '700', 'Arial Narrow');
        }
    }

    function drawTitle(context, title, subtitle) {
        var ctx = context.ctx;
        var region = context.region;
        var palette = context.palette;
        var centerX = region.x + region.width / 2;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        setFont(context, 'dualRingCenterTitle', 18, '700');
        ctx.fillStyle = palette.text;
        ctx.fillText(title, centerX, region.y + 10);
        if (subtitle) {
            setFont(context, 'dualRingCenterSubtitle', 11, '700');
            ctx.fillStyle = palette.secondary;
            ctx.fillText(subtitle, centerX, region.y + 27);
        }
        ctx.restore();
    }

    function drawMetric(context, x, y, label, value, unit, align) {
        var ctx = context.ctx;
        var palette = context.palette;
        var textAlign = align || 'center';

        ctx.save();
        ctx.textAlign = textAlign;
        ctx.textBaseline = 'middle';
        setFont(context, 'captionLegal', 10, '700');
        ctx.fillStyle = palette.secondary;
        ctx.fillText(label, x, y);
        setFont(context, 'dualRingCenterValue', 19, '700');
        ctx.fillStyle = palette.text;
        ctx.fillText(value, x, y + 17);
        if (unit) {
            setFont(context, 'captionLegal', 10, '700');
            ctx.fillStyle = palette.secondary;
            ctx.fillText(unit, x, y + 31);
        }
        ctx.restore();
    }

    function drawBar(context, x, y, width, ratio, color, label) {
        var ctx = context.ctx;
        var palette = context.palette;
        var safeWidth = Math.max(0, width);
        var safeRatio = clamp(number(ratio, 0), 0, 1);

        ctx.save();
        setFont(context, 'captionLegal', 10, '700');
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = palette.secondary;
        ctx.fillText(label, x, y + 3);
        var barX = x + 28;
        var barWidth = Math.max(0, safeWidth - 28);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(barX, y, barWidth, 6);
        ctx.fillStyle = color || palette.primary;
        ctx.fillRect(barX, y, barWidth * safeRatio, 6);
        ctx.restore();
    }

    function displayPower(view, data) {
        if (view.isMetric) {
            return { value: Math.round(number(read(data, ['power_kw'], number(data && data.PowerWatts, 0) / 1000), 0)), unit: 'kW' };
        }
        return { value: Math.round(number(read(data, ['power_hp'], number(data && data.PowerWatts, 0) / 745.7), 0)), unit: 'HP' };
    }

    function displayTorque(view, data) {
        if (view.isMetric) {
            return { value: Math.round(number(read(data, ['torque_nm'], data && data.TorqueNewtons), 0)), unit: 'N·m' };
        }
        return { value: Math.round(number(read(data, ['torque_ftlbs'], number(data && data.TorqueNewtons, 0) * 0.737562), 0)), unit: 'FT·LB' };
    }

    function displayBoost(view, data) {
        if (view.isMetric) {
            return { value: number(read(data, ['boost_bar'], number(data && data.Boost, 0) / 14.5038), 0).toFixed(1), unit: 'BAR' };
        }
        return { value: number(read(data, ['boost_psi', 'boost'], data && data.Boost), 0).toFixed(1), unit: 'PSI' };
    }

    function displayFuel(data) {
        var fuel = number(read(data, ['Fuel', 'fuel'], -1), -1);
        if (fuel < 0) return { value: '--', unit: '%' };
        if (fuel > 1) fuel /= 100;
        return { value: Math.round(clamp(fuel, 0, 1) * 100), unit: '%' };
    }

    window.S650HmiCenterInfoCommon = {
        clamp: clamp,
        number: number,
        read: read,
        drawTitle: drawTitle,
        drawMetric: drawMetric,
        drawBar: drawBar,
        displayPower: displayPower,
        displayTorque: displayTorque,
        displayBoost: displayBoost,
        displayFuel: displayFuel
    };
})(window);
