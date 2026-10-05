/* Period scale geometry and one-time SVG assembly; live readings never rebuild artwork. */
(function (root) {
    'use strict';
    // Reference-photo visual geometry, not claimed factory calibration dimensions.
    var AUXILIARY_GEOMETRY = Object.freeze({
        face: Object.freeze({ cx: 60, cy: 60, radius: 54 }),
        temperature: Object.freeze({ cx: 46, cy: 60, needleLength: 56, tickInner: 55, tickOuter: 61, start: 45, end: -45 }),
        boost: Object.freeze({ cx: 74, cy: 60, needleLength: 56, tickInner: 55, tickOuter: 61, start: 135, end: 225 })
    });
    function point(cx, cy, r, angle) {
        var a = angle * Math.PI / 180;
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }
    function text(x, y, value, klass, id) {
        return '<text x="' + x + '" y="' + y + '" text-anchor="middle" class="' + klass + '"' +
            (id ? ' id="' + id + '"' : '') + '>' + value + '</text>';
    }
    function tachAngle(rpm) {
        rpm = root.R34Model.clamp(rpm || 0, 0, 10000);
        return 150 + (rpm <= 3000 ? rpm / 1000 * 10 : 30 + (rpm - 3000) / 1000 * 30);
    }
    // Nür photographs establish the markings and approximate250° arc; this is a HUD visual mapping, not factory calibration.
    function speedAngle(kmh) { return 145 + root.R34Model.clamp(kmh || 0, 0, 300) / 300 * 250; }
    function auxiliaryAngle(kind, ratio) {
        var geometry = AUXILIARY_GEOMETRY[kind];
        return geometry.start + root.R34Model.clamp(ratio || 0, 0, 1) * (geometry.end - geometry.start);
    }
    function auxiliaryTransform(kind, ratio) {
        var geometry = AUXILIARY_GEOMETRY[kind];
        return 'translate(' + geometry.cx + ' ' + geometry.cy + ') rotate(' + auxiliaryAngle(kind, ratio) + ')';
    }
    function mfdDialMarkup(id, label) {
        var A = root.R34Artwork;
        var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 152" role="img" aria-label="' + label + '">';
        s += A.circle(76, 74, 43, 'url(#sector)');
        s += '<path id="' + id + '-sector" d="M76,74Z" fill="var(--r34-green)"/>';
        s += A.path(A.arc(76, 74, 43.5, 90, 360), 'none', 'stroke="url(#chrome)" stroke-width="10"');
        for (var i = 0; i <= 25; i++) {
            s += A.tick(76, 74, 39.5, i % 5 === 0 ? 48.4 : 44.7, 90 + i / 25 * 270,
                'var(--r34-ink)', i % 5 === 0 ? 2 : 1);
        }
        s += '<g id="' + id + '-labels"></g>';
        s += A.circle(76, 74, 14, 'url(#chrome)', 'stroke="var(--r34-dim)" stroke-width="1"');
        if (label === 'ENGINE') s += text(103, 91, 'RPM', 'r34-mfd-symbol');
        else s += '<g transform="translate(103 88)" fill="none" stroke="var(--r34-ink)" stroke-width="1.2"><circle r="6"/><path d="M0 -4Q6 0 0 3Q-5 -1 0 -3M-7 -3h-5v-4h14q8 1 9 9h-5M-6 4l5 5h10v-3"/></g>';
        // The low-right PEAK quarter stays outside the endpoint/units bounding boxes.
        s += '<path class="r34-peak-panel" d="M88 101H134Q128 140 92 151L90 151Z" fill="url(#peak)" stroke="var(--r34-teal)" stroke-width=".8"/>';
        s += A.ln(90, 102, 132, 102, 'var(--r34-peak-edge)', .8);
        s += text(109, 116, 'N/A', 'r34-digital', id + '-value');
        s += text(109, 128, 'PEAK', 'r34-peak-label');
        s += text(105, 141, 'N/A', 'r34-peak-value', id + '-peak');
        s += text(37, 149, 'bar', 'r34-mfd-unit', id + '-unit');
        return s + '</svg>';
    }
    function scaleLabel(value) { return Math.abs(value) < 0.00001 ? '0' : String(Number(value.toFixed(1))); }
    function setDialLabels(group, min, max) {
        var s = '';
        for (var i = 0; i <= 5; i++) {
            var p = point(76, 74, 58, 90 + i / 5 * 270);
            // Native negative origin is offset left of the low-right PEAK quadrant.
            s += text(i === 0 ? p[0] - 15 : p[0], p[1] + 3,
                scaleLabel(min + i / 5 * (max - min)), 'r34-mfd-number');
        }
        group.innerHTML = s;
    }
    function setHistoryLabels(group, min, max) {
        var s = '';
        for (var i = 0; i <= 5; i++) s += '<span>' + scaleLabel(max - i / 5 * (max - min)) + '</span>';
        group.innerHTML = s;
    }
    function sector(ratio) {
        if (ratio === null || ratio <= 0) return 'M76,74Z';
        var sweep = root.R34Model.clamp(ratio, 0, 1) * 270;
        var radians = (90 + sweep) * Math.PI / 180;
        var x = 76 + Math.cos(radians) * 43, y = 74 + Math.sin(radians) * 43;
        return 'M76,74 L76,117 A43,43 0 ' + (sweep > 180 ? 1 : 0) + ' 1 ' + x + ',' + y + ' Z';
    }
    root.R34Instruments = {
        setAuxiliaryLabels: function (group, min, max) {
            var A = root.R34Artwork;
            group.innerHTML = A.txt(47, 27, scaleLabel(max), 8) + A.txt(47, 103, scaleLabel(min), 8);
        },
        mfdDialMarkup: mfdDialMarkup, setDialLabels: setDialLabels, setHistoryLabels: setHistoryLabels,
        AUXILIARY_GEOMETRY: AUXILIARY_GEOMETRY, auxiliaryTransform: auxiliaryTransform,
        SPEED_MAX: 300, tachAngle: tachAngle, speedAngle: speedAngle, auxiliaryAngle: auxiliaryAngle, sector: sector
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.R34Instruments;
})(typeof window !== 'undefined' ? window : globalThis);
