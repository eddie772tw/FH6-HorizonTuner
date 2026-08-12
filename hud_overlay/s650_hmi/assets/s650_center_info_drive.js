/* Driving-overview center-information page. */
(function (window) {
    'use strict';

    var common = window.S650HmiCenterInfoCommon;

    function drawInput(context, x, y, label, value, color) {
        var view = context.view;
        var ratio = typeof view.getPedalValue === 'function' ? view.getPedalValue(context.data, value) : 0;
        common.drawBar(context, x, y, 170, ratio, color, label);
    }

    window.S650HmiCenterInfo.register({
        id: 'drive',
        label: 'Driving overview',
        status: 'production',
        render: function (context) {
            var ctx = context.ctx;
            var view = context.view;
            var palette = context.palette;
            var region = context.region;
            if (!ctx || !common) return;

            var leftX = region.x + 98;
            var rightX = region.x + region.width - 98;
            var speed = typeof view.roundedSpeed === 'function' ? view.roundedSpeed(context.data) : '--';
            var unit = typeof view.unitLabel === 'function' ? view.unitLabel() : '';
            var gear = typeof view.getGearLabel === 'function' ? view.getGearLabel(context.data) : '--';
            var heading = view.getTelemetryReadout ? view.getTelemetryReadout('heading', context.data).value : '--';
            var distance = view.getTelemetryReadout ? view.getTelemetryReadout('odometer', context.data) : { value: '--', unit: '' };
            var lap = common.number(context.data && context.data.lap, -1);
            var position = common.number(context.data && context.data.race_position, -1);

            common.drawTitle(context, 'DRIVE OVERVIEW', 'LIVE VEHICLE STATUS');
            common.drawMetric(context, leftX, region.y + 54, 'SPEED', speed, unit, 'center');
            common.drawMetric(context, rightX, region.y + 54, 'GEAR', gear, '', 'center');
            common.drawMetric(context, leftX, region.y + 105, 'HEADING', heading, '', 'center');
            common.drawMetric(context, rightX, region.y + 105, 'DISTANCE', distance.value, distance.unit, 'center');
            common.drawMetric(context, leftX, region.y + 156, 'LAP', lap < 0 ? '--' : String(lap), '', 'center');
            common.drawMetric(context, rightX, region.y + 156, 'RACE POS', position < 0 ? '--' : String(position), '', 'center');

            // Inputs are intentionally page-owned. No center registry or
            // container-level renderer adds these bars to other pages.
            drawInput(context, region.x + 22, region.y + region.height - 27, 'THR', 'throttle', palette.primary);
            drawInput(context, region.x + region.width - 192, region.y + region.height - 27, 'BRK', 'brake', palette.warning);
        },
        renderCompact: function (context) {
            var view = context.view;
            var region = context.region;
            var heading = view.getTelemetryReadout ? view.getTelemetryReadout('heading', context.data).value : '--';
            var distance = view.getTelemetryReadout ? view.getTelemetryReadout('odometer', context.data) : { value: '--', unit: '' };

            common.drawTitle(context, 'DRIVE', '');
            common.drawMetric(context, region.x + 82, region.y + 35, 'HEADING', heading, '', 'center');
            common.drawMetric(context, region.x + region.width - 82, region.y + 35, 'DISTANCE', distance.value, distance.unit, 'center');
        }
    });
})(window);
