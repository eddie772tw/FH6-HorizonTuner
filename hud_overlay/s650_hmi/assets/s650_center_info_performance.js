/* Performance center-information page. */
(function (window) {
    'use strict';

    window.S650HmiCenterInfo.register({
        id: 'performance',
        label: 'Performance telemetry',
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
            var centerX = x + width / 2;
            var rpm = Math.round(view.getRpm(context.data));
            var maxRpm = Math.round(view.getMaxRpm(context.data));

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            p.setFont(16, '700', 'Arial Narrow');
            ctx.fillStyle = palette.text;
            ctx.fillText('PERFORMANCE', centerX, y + 16);
            p.setFont(12, '700', 'Arial Narrow');
            ctx.fillStyle = palette.secondary;
            ctx.fillText(rpm + ' / ' + maxRpm + ' RPM', centerX, y + 40);
            ctx.restore();
        }
    });
})(window);
