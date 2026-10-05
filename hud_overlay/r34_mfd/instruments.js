/* Original vector artwork. Geometry follows the documented BNR34 V-spec layout. */
(function (root) {
    'use strict';
    var NS = 'http://www.w3.org/2000/svg';
    function point(cx, cy, r, angle) { var a = angle * Math.PI / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }
    function arc(cx, cy, r, a, b) {
        var p = point(cx, cy, r, a), q = point(cx, cy, r, b);
        return 'M' + p[0] + ',' + p[1] + ' A' + r + ',' + r + ' 0 ' + (b - a > 180 ? 1 : 0) + ' 1 ' + q[0] + ',' + q[1];
    }
    function line(cx, cy, inner, outer, angle, color, width) {
        var a = point(cx, cy, inner, angle), b = point(cx, cy, outer, angle);
        return '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '" stroke="' + color + '" stroke-width="' + width + '"/>';
    }
    function text(x, y, value, klass, anchor) {
        return '<text x="' + x + '" y="' + y + '" text-anchor="' + (anchor || 'middle') + '" class="' + (klass || '') + '">' + value + '</text>';
    }
    function tachAngle(rpm) {
        rpm = root.R34Model.clamp(rpm || 0, 0, 10000);
        return 145 + (rpm <= 3000 ? rpm / 1000 * 15 : 45 + (rpm - 3000) / 1000 * 30);
    }
    function dialFace(cx, cy, r) {
        return '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r + 4) + '" fill="var(--r34-shadow)" stroke="var(--r34-metal)" stroke-width="1.5"/><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="url(#r34FaceGradient)"/>';
    }
    function needle(id, cx, cy, length) {
        return '<g id="' + id + '" transform="translate(' + cx + ' ' + cy + ')"><path class="r34-needle" d="M-16,-5 L' + length + ',0 L-16,5 L-23,2 L-23,-2Z"/><circle r="9" fill="var(--r34-shadow)" stroke="var(--r34-edge)" stroke-width="2"/></g>';
    }
    function clusterMarkup() {
        var s = '<svg xmlns="' + NS + '" viewBox="0 0 675 290" role="img" aria-label="BNR34 V-spec tachometer, speedometer, fuel and unavailable coolant and oil pressure">';
        s += '<defs><linearGradient id="r34CaseGradient" x2="0" y2="1"><stop stop-color="var(--r34-edge)"/><stop offset=".2" stop-color="var(--r34-case)"/><stop offset="1" stop-color="var(--r34-shadow)"/></linearGradient><radialGradient id="r34FaceGradient"><stop stop-color="var(--r34-face)"/><stop offset="1" stop-color="var(--r34-shadow)"/></radialGradient></defs>';
        s += '<path d="M10,268 L10,177 Q13,143 61,141 L91,140 Q97,49 162,31 Q219,9 338,10 Q455,10 515,31 Q579,49 585,140 L618,141 Q663,144 665,177 L665,268 Q533,284 337,278 Q142,285 10,268Z" fill="url(#r34CaseGradient)" stroke="var(--r34-edge)" stroke-width="3"/>';
        s += '<path d="M19,262 L20,179 Q22,152 63,151 L100,151 Q104,56 165,40 Q244,16 337,20 Q433,18 511,40 Q573,58 576,151 L616,151 Q651,152 655,179 L655,262 Q482,270 337,267 Q179,270 19,262Z" fill="var(--r34-face)" stroke="var(--r34-shadow)" stroke-width="4"/>';
        s += dialFace(221, 151, 104) + dialFace(450, 151, 104) + dialFace(62, 206, 41) + dialFace(613, 206, 41);
        s += '<g id="r34TachFace" class="r34-lit">';
        for (var rpm = 0; rpm <= 10000; rpm += 200) {
            var angle = tachAngle(rpm), major = rpm % 1000 === 0, hot = rpm >= 8000;
            s += line(221, 151, major ? 86 : 92, 100, angle, hot ? 'var(--r34-hot)' : 'var(--r34-tick)', major ? 3 : 1.4);
            if (major) { var p = point(221, 151, 73, angle); s += text(p[0], p[1] + 6, rpm / 1000, 'r34-dial-number'); }
        }
        s += text(221, 111, 'BNR34', 'r34-small-label') + text(221, 174, 'x1000 r/min', 'r34-small-label') + '</g>';
        s += '<g id="r34SpeedFace" class="r34-lit">';
        for (var speed = 0; speed <= 180; speed += 5) {
            var speedAngle = 145 + speed / 180 * 255, speedMajor = speed % 20 === 0;
            s += line(450, 151, speedMajor ? 86 : 93, 100, speedAngle, 'var(--r34-tick)', speedMajor ? 3 : 1.3);
            if (speedMajor) { var q = point(450, 151, 73, speedAngle); s += text(q[0], q[1] + 5, speed, 'r34-dial-number'); }
        }
        s += text(450, 112, 'SKYLINE', 'r34-small-label') + text(450, 174, 'km/h', 'r34-small-label') + '</g>';
        s += '<g id="r34FuelFace">';
        for (var j = 0; j <= 4; j++) s += line(613, 206, 27, 35, 135 + j * 30, 'var(--r34-tick)', j % 4 ? 1.5 : 3);
        s += text(588, 240, 'E', 'r34-small-label') + text(607, 181, 'F', 'r34-small-label') + text(627, 211, 'FUEL', 'r34-small-label') + '</g>';
        s += '<path d="' + arc(62, 206, 32, 145, 245) + '" fill="none" stroke="var(--r34-dim)" stroke-width="2"/>';
        s += text(33, 234, 'C', 'r34-small-label') + text(49, 178, 'H', 'r34-small-label') + text(65, 207, 'N/A', 'r34-off') + text(65, 220, 'WATER', 'r34-small-label');
        s += '<path d="M183,205 Q221,183 259,205 L253,240 Q220,255 190,240Z" fill="var(--r34-face)" stroke="var(--r34-dim)"/>';
        s += text(221, 215, 'OIL PRESS', 'r34-small-label') + text(221, 235, 'N/A', 'r34-off');
        s += '<rect x="398" y="201" width="106" height="30" rx="3" fill="var(--r34-lcd)" stroke="var(--r34-shadow)" stroke-width="3"/>';
        s += text(451, 223, '—', 'r34-lcd-readout').replace('<text ', '<text id="r34Distance" ');
        s += needle('r34TachNeedle', 221, 151, 87) + needle('r34SpeedNeedle', 450, 151, 87) + needle('r34FuelNeedle', 613, 206, 28);
        s += '<g id="r34DigitalSpeedGroup">' + text(450, 251, '— km/h', 'r34-small-label').replace('<text ', '<text id="r34DigitalSpeed" ') + '</g>';
        s += text(335, 146, 'GEAR', 'r34-small-label') + text(335, 174, '—', 'r34-dial-number').replace('<text ', '<text id="r34Gear" ');
        s += text(335, 63, 'V·spec', 'r34-small-label') + text(335, 84, '1999', 'r34-small-label');
        s += '<text x="338" y="264" text-anchor="middle" class="r34-small-label" id="r34ClusterNote">GAME TELEMETRY</text></svg>';
        return s;
    }
    function mfdDialMarkup(id, label) {
        var s = '<svg xmlns="' + NS + '" viewBox="0 0 172 202" aria-label="' + label + '">';
        s += text(86, 18, label, 'r34-mfd-number');
        s += '<path d="' + arc(86, 101, 62, 135, 405) + '" fill="none" stroke="var(--r34-metal)" stroke-width="18"/>';
        s += '<path id="' + id + '-sector" d="M86,101Z" fill="var(--r34-green)" opacity=".9"/>';
        for (var i = 0; i <= 25; i++) s += line(86, 101, 54, i % 5 === 0 ? 71 : 63, 135 + i / 25 * 270, 'var(--r34-ink)', 1.1);
        s += '<g id="' + id + '-labels"></g>';
        s += '<path d="M103,132 L164,127 L161,169 L121,189 L103,173Z" fill="var(--r34-teal)" opacity=".85"/>';
        s += '<path id="' + id + '-needle" d="M-10,-2 L62,0 L-10,2Z" fill="var(--r34-needle)" transform="translate(86 101) rotate(135)"/>';
        s += '<circle cx="86" cy="101" r="15" fill="var(--r34-metal)" stroke="var(--r34-dim)"/>';
        s += text(132, 148, '—', 'r34-digital').replace('<text ', '<text id="' + id + '-value" ');
        s += text(132, 161, 'PEAK', 'r34-mfd-number') + text(132, 176, '—', 'r34-mfd-number').replace('<text ', '<text id="' + id + '-peak" ');
        s += text(45, 190, 'bar', 'r34-mfd-number').replace('<text ', '<text id="' + id + '-unit" ') + '</svg>';
        return s;
    }
    function setDialLabels(group, min, max) {
        var s = '';
        for (var i = 0; i <= 5; i++) {
            var p = point(86, 101, 83, 135 + i / 5 * 270);
            var v = min + i / 5 * (max - min);
            s += text(p[0], p[1] + 4, Math.abs(v) < 0.00001 ? '0' : String(Number(v.toFixed(1))), 'r34-mfd-number');
        }
        group.innerHTML = s;
    }
    function sector(ratio) {
        if (ratio === null || ratio <= 0) return 'M86,101Z';
        var end = 135 + root.R34Model.clamp(ratio, 0, 1) * 270;
        var startRadians = 135 * Math.PI / 180, endRadians = end * Math.PI / 180;
        return 'M86,101 L' + (86 + Math.cos(startRadians) * 51) + ',' + (101 + Math.sin(startRadians) * 51) + ' A51,51 0 ' + (end - 135 > 180 ? 1 : 0) + ' 1 ' + (86 + Math.cos(endRadians) * 51) + ',' + (101 + Math.sin(endRadians) * 51) + ' Z';
    }
    root.R34Instruments = { clusterMarkup: clusterMarkup, mfdDialMarkup: mfdDialMarkup, setDialLabels: setDialLabels,
        tachAngle: tachAngle, sector: sector };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.R34Instruments;
})(typeof window !== 'undefined' ? window : globalThis);
