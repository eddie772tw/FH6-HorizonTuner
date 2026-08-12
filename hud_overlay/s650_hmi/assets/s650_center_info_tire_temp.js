/* Tire-temperature center-information page. */
(function (window) {
    'use strict';

    var common = window.S650HmiCenterInfoCommon;

    function temperatureColor(context, value) {
        if (value === null) return context.palette.secondary;
        var view = context.view;
        var displayed = view.isMetric ? (value - 32) * 5 / 9 : value;
        if (displayed < (view.isMetric ? 55 : 130)) return '#5AB7FF';
        if (displayed > (view.isMetric ? 105 : 220)) return context.palette.danger;
        return context.palette.primary;
    }

    function drawVehicle(context, temps) {
        var ctx = context.ctx;
        var view = context.view;
        var palette = context.palette;
        var region = context.region;
        var cx = region.x + region.width / 2;
        var bodyY = region.y + 48;
        var bodyHeight = 125;
        var wheelX = 47;
        var frontWheelY = bodyY + 31;
        var rearWheelY = bodyY + bodyHeight - 31;
        var labels = ['FL', 'FR', 'RL', 'RR'];
        var positions = [
            { x: cx - wheelX - 13, y: frontWheelY, align: 'right' },
            { x: cx + wheelX + 13, y: frontWheelY, align: 'left' },
            { x: cx - wheelX - 13, y: rearWheelY, align: 'right' },
            { x: cx + wheelX + 13, y: rearWheelY, align: 'left' }
        ];

        ctx.save();
        // Draw a symmetric top-view silhouette on a fixed grid. The previous
        // asymmetric polygon made the vehicle look skewed inside this region.
        ctx.beginPath();
        ctx.moveTo(cx - 21, bodyY);
        ctx.lineTo(cx + 21, bodyY);
        ctx.lineTo(cx + 29, bodyY + 23);
        ctx.lineTo(cx + 29, bodyY + bodyHeight - 23);
        ctx.lineTo(cx + 21, bodyY + bodyHeight);
        ctx.lineTo(cx - 21, bodyY + bodyHeight);
        ctx.lineTo(cx - 29, bodyY + bodyHeight - 23);
        ctx.lineTo(cx - 29, bodyY + 23);
        ctx.closePath();
        ctx.fillStyle = 'rgba(35, 77, 137, 0.34)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(128, 177, 244, 0.82)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.strokeStyle = 'rgba(231, 236, 235, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 20, bodyY + 32); ctx.lineTo(cx + 20, bodyY + 32);
        ctx.moveTo(cx - 20, bodyY + 92); ctx.lineTo(cx + 20, bodyY + 92);
        ctx.moveTo(cx, bodyY + 32); ctx.lineTo(cx, bodyY + 92);
        ctx.stroke();

        for (var index = 0; index < positions.length; index += 1) {
            var position = positions[index];
            var wheelCenterX = index % 2 === 0 ? cx - wheelX : cx + wheelX;
            var wheelCenterY = index < 2 ? frontWheelY : rearWheelY;
            ctx.fillStyle = temperatureColor(context, temps[index]);
            ctx.fillRect(wheelCenterX - 7, wheelCenterY - 14, 14, 28);
            ctx.strokeStyle = 'rgba(231, 236, 235, 0.66)';
            ctx.strokeRect(wheelCenterX - 7, wheelCenterY - 14, 14, 28);

            ctx.textAlign = position.align;
            ctx.textBaseline = 'middle';
            if (context.primitives && typeof context.primitives.setFont === 'function') {
                context.primitives.setFont(16, '700', 'Arial Narrow');
            }
            ctx.fillStyle = temps[index] === null ? palette.secondary : palette.text;
            ctx.fillText(view.formatTireTemperature(temps[index]), position.x, position.y - 4);
            if (context.primitives && typeof context.primitives.setFont === 'function') {
                context.primitives.setFont(10, '700', 'Arial Narrow');
            }
            ctx.fillStyle = palette.secondary;
            ctx.fillText(labels[index], position.x, position.y + 11);
        }
        ctx.restore();
    }

    function drawCompactVehicle(context, temps) {
        var ctx = context.ctx;
        var view = context.view;
        var palette = context.palette;
        var region = context.region;
        var cx = region.x + region.width / 2;
        var bodyY = region.y + 27;
        var bodyHeight = 50;
        var wheelX = 31;
        var positions = [
            { x: cx - wheelX - 10, y: bodyY + 14, align: 'right', label: 'FL' },
            { x: cx + wheelX + 10, y: bodyY + 14, align: 'left', label: 'FR' },
            { x: cx - wheelX - 10, y: bodyY + 38, align: 'right', label: 'RL' },
            { x: cx + wheelX + 10, y: bodyY + 38, align: 'left', label: 'RR' }
        ];

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx - 13, bodyY);
        ctx.lineTo(cx + 13, bodyY);
        ctx.lineTo(cx + 19, bodyY + 10);
        ctx.lineTo(cx + 19, bodyY + bodyHeight - 10);
        ctx.lineTo(cx + 13, bodyY + bodyHeight);
        ctx.lineTo(cx - 13, bodyY + bodyHeight);
        ctx.lineTo(cx - 19, bodyY + bodyHeight - 10);
        ctx.lineTo(cx - 19, bodyY + 10);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(128, 177, 244, 0.82)';
        ctx.lineWidth = 1;
        ctx.stroke();

        for (var index = 0; index < positions.length; index += 1) {
            var position = positions[index];
            var wheelCenterX = index % 2 === 0 ? cx - wheelX : cx + wheelX;
            var wheelCenterY = position.y;
            ctx.fillStyle = temperatureColor(context, temps[index]);
            ctx.fillRect(wheelCenterX - 4, wheelCenterY - 7, 8, 14);
            ctx.textAlign = position.align;
            if (context.primitives && typeof context.primitives.setFont === 'function') {
                context.primitives.setFont(11, '700', 'Arial Narrow');
            }
            ctx.fillStyle = temps[index] === null ? palette.secondary : palette.text;
            ctx.fillText(view.formatTireTemperature(temps[index]), position.x, position.y - 2);
            if (context.primitives && typeof context.primitives.setFont === 'function') {
                context.primitives.setFont(7, '700', 'Arial Narrow');
            }
            ctx.fillStyle = palette.secondary;
            ctx.fillText(position.label, position.x, position.y + 8);
        }
        ctx.restore();
    }

    window.S650HmiCenterInfo.register({
        id: 'tire_temp',
        label: 'Tire temperature',
        status: 'production',
        render: function (context) {
            var ctx = context.ctx;
            if (!ctx || !common) return;

            var region = context.region;
            var view = context.view;
            var palette = context.palette;
            var temps = view.getTireTemperatures(context.data);
            var hasTemperature = false;
            for (var i = 0; i < temps.length; i++) {
                if (temps[i] !== null) {
                    hasTemperature = true;
                    break;
                }
            }
            common.drawTitle(context, 'TIRE TEMPERATURE', hasTemperature ? view.tireTemperatureUnit() : 'SENSOR UNAVAILABLE');
            drawVehicle(context, temps);
        },
        renderCompact: function (context) {
            var view = context.view;
            var temps = view.getTireTemperatures(context.data);

            common.drawTitle(context, 'TIRE TEMP', '');
            drawCompactVehicle(context, temps);
        }
    });
})(window);
