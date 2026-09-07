/* Powertrain center-information page. */
(function (window) {
    'use strict';

    var common = window.S650HmiCenterInfoCommon;

    window.S650HmiCenterInfo.register({
        id: 'performance',
        label: 'Powertrain telemetry',
        status: 'production',
        render: function (context) {
            var ctx = context.ctx;
            var view = context.view;
            var palette = context.palette;
            var region = context.region;
            if (!ctx || !common) return;

            var rpm = Math.round(view.getRpm(context.data));
            var maxRpm = Math.round(view.getMaxRpm(context.data));
            var power = common.displayPower(view, context.data);
            var torque = common.displayTorque(view, context.data);
            var boost = common.displayBoost(view, context.data);
            var fuel = common.displayFuel(context.data);
            var xLeft = region.x + 105;
            var xRight = region.x + region.width - 105;
            var rpmRatio = maxRpm > 0 ? rpm / maxRpm : 0;

            common.drawTitle(context, 'POWERTRAIN', 'LIVE OUTPUT');
            common.drawMetric(context, xLeft, region.y + 54, 'POWER', power.value, power.unit, 'center');
            common.drawMetric(context, xRight, region.y + 54, 'TORQUE', torque.value, torque.unit, 'center');
            common.drawMetric(context, xLeft, region.y + 105, 'BOOST', boost.value, boost.unit, 'center');
            common.drawMetric(context, xRight, region.y + 105, 'FUEL', fuel.value, fuel.unit, 'center');
            common.drawMetric(context, region.x + region.width / 2, region.y + 151, 'RPM', rpm + ' / ' + maxRpm, '', 'center');
            common.drawBar(context, region.x + 38, region.y + 187, region.width - 76, rpmRatio, palette.primary, 'RPM');
        },
        renderCompact: function (context) {
            var view = context.view;
            var region = context.region;
            var power = common.displayPower(view, context.data);
            var boost = common.displayBoost(view, context.data);
            var colLeft = region.x + Math.round(region.width * 0.26);
            var colRight = region.x + region.width - Math.round(region.width * 0.26);
            var metricY = region.y + 36;
            var midX = region.x + Math.round(region.width / 2);

            common.drawTitle(context, 'POWERTRAIN', '');
            if (typeof common.drawDivider === 'function') {
                common.drawDivider(context, midX, region.y + 24, region.y + region.height - 12);
            }
            common.drawMetric(context, colLeft, metricY, 'POWER', power.value, power.unit, 'center');
            common.drawMetric(context, colRight, metricY, 'BOOST', boost.value, boost.unit, 'center');
        }
    });
})(window);
