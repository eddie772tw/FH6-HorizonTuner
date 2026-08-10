/* Tire-temperature center-information page. */
(function (window) {
    'use strict';

    window.S650HmiCenterInfo.register({
        id: 'tire_temp',
        label: 'Tire temperature',
        status: 'production',
        render: function (context) {
            var ctx = context.ctx;
            var p = context.primitives;
            if (!ctx || !p) return;

            var region = context.region;
            var view = context.view;
            var palette = context.palette;
            var x = region.x;
            var y = region.y;
            var width = region.width;
            var height = region.height;
            var cx = x + width / 2;
            var temps = view.getTireTemperatures(context.data);
            var hasTemperature = temps.some(function (value) { return value !== null; });
            var valueSpread = Math.min(width * 0.18, 76);
            var labels = ['FL', 'FR', 'RL', 'RR'];
            var positions = [
                { x: cx - valueSpread, y: y + 48, align: 'right' },
                { x: cx + valueSpread, y: y + 48, align: 'left' },
                { x: cx - valueSpread, y: y + height - 45, align: 'right' },
                { x: cx + valueSpread, y: y + height - 45, align: 'left' }
            ];
            var fontSize = p.getFontSize;
            var setFont = p.setFont;

            ctx.save();
            setFont(fontSize(view, 'dualRingCenterTitle', 18), '700', 'Arial Narrow');
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#F3F5F4';
            ctx.fillText('TIRE TEMPERATURE', cx, y + 7);
            setFont(fontSize(view, 'dualRingCenterSubtitle', 12), '700', 'Arial Narrow');
            ctx.fillStyle = '#CDD5D4';
            ctx.fillText(hasTemperature ? view.tireTemperatureUnit() : 'SENSOR UNAVAILABLE', cx, y + 23);

            ctx.strokeStyle = 'rgba(96, 142, 210, 0.78)';
            ctx.fillStyle = 'rgba(35, 77, 137, 0.50)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx - 20, y + 37);
            ctx.lineTo(cx + 20, y + 37);
            ctx.lineTo(cx + 23, y + height / 2);
            ctx.lineTo(cx + 13, y + height - 20);
            ctx.lineTo(cx - 13, y + height - 20);
            ctx.lineTo(cx - 23, y + height / 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = 'rgba(128, 177, 244, 0.58)';
            ctx.fillRect(cx - 30, y + 44, 7, 21);
            ctx.fillRect(cx + 23, y + 44, 7, 21);
            ctx.fillRect(cx - 30, y + height - 56, 7, 21);
            ctx.fillRect(cx + 23, y + height - 56, 7, 21);

            ctx.strokeStyle = 'rgba(231, 236, 235, 0.62)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx - valueSpread + 5, y + 52); ctx.lineTo(cx - 31, y + 52);
            ctx.moveTo(cx - valueSpread + 5, y + height - 22); ctx.lineTo(cx - 31, y + height - 22);
            ctx.moveTo(cx + 31, y + 52); ctx.lineTo(cx + valueSpread - 5, y + 52);
            ctx.moveTo(cx + 31, y + height - 22); ctx.lineTo(cx + valueSpread - 5, y + height - 22);
            ctx.stroke();

            for (var index = 0; index < positions.length; index += 1) {
                var position = positions[index];
                ctx.textAlign = position.align;
                setFont(fontSize(view, 'dualRingCenterValue', 18), '700', 'Arial Narrow');
                ctx.fillStyle = temps[index] === null ? '#AEB8B7' : '#FFFFFF';
                ctx.fillText(view.formatTireTemperature(temps[index]), position.x, position.y);
                setFont(fontSize(view, 'dualRingCenterPosition', 10), '700', 'Arial Narrow');
                ctx.fillStyle = '#CDD5D4';
                ctx.fillText(labels[index], position.x, position.y + 12);
            }
            ctx.restore();
        }
    });
})(window);
