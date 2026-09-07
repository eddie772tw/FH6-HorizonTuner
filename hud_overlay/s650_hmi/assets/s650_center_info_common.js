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
        var isCompact = Boolean(region.layout && region.layout.isCompact);
        var titleY = region.y + (isCompact ? 14 : 10);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        setFont(context, isCompact ? 'dualRingCenterSubtitle' : 'dualRingCenterTitle', isCompact ? 13 : 18, '700');
        ctx.fillStyle = palette.text;
        ctx.fillText(title, centerX, titleY);
        if (subtitle) {
            setFont(context, 'dualRingCenterSubtitle', 11, '700');
            ctx.fillStyle = palette.secondary;
            ctx.fillText(subtitle, centerX, region.y + 27);
        }
        ctx.restore();
    }

    function drawDivider(context, x, y1, y2, color) {
        var ctx = context.ctx;
        if (!ctx || typeof ctx.moveTo !== 'function' || typeof ctx.lineTo !== 'function') return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
        ctx.strokeStyle = color || 'rgba(194, 226, 234, 0.24)';
        ctx.lineWidth = 1;
        ctx.stroke();
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
        var unit = data && data.displayUnits && data.displayUnits.power;
        if (unit === 'kw') return { value: Math.round(number(data && data.power_kw, 0)), unit: 'kW' };
        if (unit === 'ps') return { value: Math.round(number(data && data.power_ps, 0)), unit: 'PS' };
        if (unit === 'hp') return { value: Math.round(number(data && data.power_hp, 0)), unit: 'HP' };
        return view.isMetric
            ? { value: Math.round(number(data && data.power_kw, 0)), unit: 'kW' }
            : { value: Math.round(number(data && data.power_hp, 0)), unit: 'HP' };
    }

    function displayTorque(view, data) {
        var unit = data && data.displayUnits && data.displayUnits.torque;
        if (unit === 'nm') return { value: Math.round(number(data && data.torque_nm, 0)), unit: 'N·m' };
        if (unit === 'lbft') return { value: Math.round(number(data && data.torque_ftlbs, 0)), unit: 'FT·LB' };
        return view.isMetric
            ? { value: Math.round(number(data && data.torque_nm, 0)), unit: 'N·m' }
            : { value: Math.round(number(data && data.torque_ftlbs, 0)), unit: 'FT·LB' };
    }

    function displayBoost(view, data) {
        var unit = data && data.displayUnits && data.displayUnits.boostPressure;
        if (unit === 'bar') return { value: number(data && data.boost_bar, 0).toFixed(1), unit: 'BAR' };
        if (unit === 'kpa') return { value: number(data && data.boost_kpa, 0).toFixed(0), unit: 'kPa' };
        if (unit === 'psi') return { value: number(data && data.boost_psi, 0).toFixed(1), unit: 'PSI' };
        return view.isMetric
            ? { value: number(data && data.boost_bar, 0).toFixed(1), unit: 'BAR' }
            : { value: number(data && data.boost_psi, 0).toFixed(1), unit: 'PSI' };
    }

    function displayFuel(data) {
        var fuel = number(data && data.fuel_ratio, -1);
        if (fuel < 0) return { value: '--', unit: '%' };
        return { value: Math.round(clamp(fuel, 0, 1) * 100), unit: '%' };
    }

    var BACKGROUND_SPEC = Object.freeze({
        alpha: 0.15,
        fill: 'rgba(0, 0, 0, 0.15)',
        dualRing: Object.freeze({
            width: 360,
            padX: 35,
            radius: 12
        }),
        trackSidebar: Object.freeze({
            radius: 6
        })
    });

    function drawBackground(context) {
        if (!context) return;
        var ctx = context.ctx;
        if (!ctx) return;

        var region = context.region || {};
        var isCompact = Boolean(region.layout && region.layout.isCompact);
        var width = region.width || 0;
        var padX = 0;
        if (!isCompact && width >= 400) {
            padX = BACKGROUND_SPEC.dualRing.padX;
        }

        var x = (region.x || 0) + padX;
        var y = region.y || 0;
        var bgWidth = Math.max(0, width - padX * 2);
        var bgHeight = Math.max(0, region.height || 0);
        var radius = isCompact ? BACKGROUND_SPEC.trackSidebar.radius : BACKGROUND_SPEC.dualRing.radius;
        var palette = context.palette || {};
        var fill = palette.centerWidgetBackground || BACKGROUND_SPEC.fill;

        ctx.save();
        if (context.primitives && typeof context.primitives.drawRoundedPanel === 'function') {
            context.primitives.drawRoundedPanel(x, y, bgWidth, bgHeight, radius, fill);
        } else {
            ctx.fillStyle = fill;
            if (typeof ctx.roundRect === 'function') {
                ctx.beginPath();
                ctx.roundRect(x, y, bgWidth, bgHeight, radius);
                ctx.fill();
            } else if (typeof ctx.quadraticCurveTo === 'function') {
                ctx.beginPath();
                ctx.moveTo(x + radius, y);
                ctx.lineTo(x + bgWidth - radius, y);
                ctx.quadraticCurveTo(x + bgWidth, y, x + bgWidth, y + radius);
                ctx.lineTo(x + bgWidth, y + bgHeight - radius);
                ctx.quadraticCurveTo(x + bgWidth, y + bgHeight, x + bgWidth - radius, y + bgHeight);
                ctx.lineTo(x + radius, y + bgHeight);
                ctx.quadraticCurveTo(x, y + bgHeight, x, y + bgHeight - radius);
                ctx.lineTo(x, y + radius);
                ctx.quadraticCurveTo(x, y, x + radius, y);
                ctx.closePath();
                ctx.fill();
            } else if (typeof ctx.fillRect === 'function') {
                ctx.fillRect(x, y, bgWidth, bgHeight);
            }
        }
        ctx.restore();
    }

    window.S650HmiCenterInfoCommon = {
        BACKGROUND_SPEC: BACKGROUND_SPEC,
        drawBackground: drawBackground,
        drawDivider: drawDivider,
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
