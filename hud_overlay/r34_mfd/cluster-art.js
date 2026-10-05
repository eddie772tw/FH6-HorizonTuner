/* Original core faces, based on the user's viewed Nür reference. */
(function (root) {
    'use strict';
    var A = root.R34Artwork;
    function open(label, size) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + label + '">'; }
    function lcd(tach) {
        var s = '<g id="' + (tach ? 'r34TachLcd' : 'r34SpeedLcd') + '" class="r34-lcd">';
        // Identical physical windows; each inner content group has independent visibility.
        s += A.rect(46, 162, 124, 34, '#0c1013', 'rx="6" stroke="#393e3d" stroke-width="1"');
        s += A.rect(49, 165, 118, 28, 'url(#lcd)', 'rx="3" class="r34-lcd-window"');
        if (tach) {
            s += '<g id="r34TachTimerGroup" style="display:none">' + A.txt(108, 185, 'N/A', 16, 'var(--r34-lcd-ink)', 'id="r34TachTimer" class="r34-lcd-timer"') + '</g>';
            s += '<g id="r34TachPowerGroup" style="display:none">';
            s += A.txt(108, 176, 'N/A HP', 12, 'var(--r34-lcd-ink)', 'id="r34LcdPower" class="r34-lcd-pair"');
            s += A.txt(108, 190, 'N/A N·m', 12, 'var(--r34-lcd-ink)', 'id="r34LcdTorque" class="r34-lcd-pair"') + '</g>';
            s += A.txt(108, 185, 'N/A', 14, 'var(--r34-lcd-ink)', 'id="r34TachUnavailable" class="r34-lcd-timer"');
        } else {
            s += '<g id="r34GearGroup">' + A.txt(65, 185, '—', 17, 'var(--r34-lcd-ink)', 'id="r34Gear" class="r34-lcd-gear"') + '</g>';
            s += '<g id="r34DigitalSpeedGroup">';
            s += A.txt(108, 185, 'N/A', 17, 'var(--r34-lcd-ink)', 'id="r34DigitalSpeed" class="r34-lcd-speed"');
            s += A.txt(148, 185, 'kmh', 8, 'var(--r34-lcd-ink)', 'id="r34DigitalSpeedUnit"') + '</g>';
        }
        return s + '</g>';
    }
    function main(kind) {
        var tach = kind === 'tach', cx = 108, cy = 108;
        var s = open(tach ? 'Symmetric compressed-low-range 10000 rpm R34 scale' : 'Nür 300 kmh analog speed scale', 216);
        s += A.dial(cx, cy, 105);
        s += '<g id="' + (tach ? 'r34TachFace' : 'r34SpeedFace') + '">';
        var limit = tach ? 10000 : root.R34Instruments.SPEED_MAX, step = tach ? 200 : 10;
        for (var v = 0; v <= limit; v += step) {
            var major = v % (tach ? 1000 : 20) === 0;
            // The compressed 0–3 segment uses major marks only, as in the viewed reference.
            if (tach && v < 3000 && !major) continue;
            var angle = tach ? root.R34Instruments.tachAngle(v) : root.R34Instruments.speedAngle(v);
            s += A.tick(cx, cy, major ? 92 : 97, 102, angle, tach && v >= 8000 ? '#b02a32' : '#e1e3df', major ? 2.2 : 1.1);
            if (major) {
                var p = A.pt(cx, cy, tach ? 77 : 78, angle);
                s += '<g class="r34-scale-numeral" data-value="' + v + '">';
                s += A.digits(p[0], p[1], tach ? v / 1000 : v, tach ? (v < 3000 ? 10 : v === 3000 ? 11.5 : 17) : 12.25, '#e1e3df', tach ? 1.9 : 2.5, true, tach ? 1.12 : .86) + '</g>';
            }
        }
        if (!tach) s += A.tick(cx, cy, 94, 102, 142, '#e1e3df', 1.4);
        s += A.txt(cx, cy - 33, tach ? 'x1000r/min' : 'kmh', 11, '#dadeda', 'font-style="italic"') + '</g>';
        s += lcd(tach);
        if (tach) s += A.circle(146, 80, 2.5, 'transparent', 'id="r34RevLamp" aria-label="RPM shift light"');
        s += A.needle(cx, cy, 96, tach ? 150 : 145, tach ? 'r34TachNeedle' : 'r34SpeedNeedle');
        return s + '</svg>';
    }
    function auxiliary(kind) {
        var temperature = kind === 'temperature', prefix = temperature ? 'r34Temp' : 'r34Boost';
        var I = root.R34Instruments, geometry = I.AUXILIARY_GEOMETRY[kind], face = I.AUXILIARY_GEOMETRY.face;
        var s = open(temperature ? 'Four-wheel average tire temperature, offset pivot and right-side cold-to-hot sweep' : 'Boost pressure, offset pivot and left-side sweep', 120);
        s += A.dial(face.cx, face.cy, face.radius);
        for (var n = 0; n <= 6; n++) {
            s += A.tick(geometry.cx, geometry.cy, n % 3 === 0 ? geometry.tickInner : geometry.tickInner + 3,
                geometry.tickOuter, I.auxiliaryAngle(kind, n / 6), '#d9dddd', n % 3 === 0 ? 1.7 : 1);
        }
        if (temperature) {
            s += A.txt(50, 23, 'TIRE', 8.5, '#dce1df') + A.txt(50, 33, 'TEMP', 8.5, '#dce1df');
            s += '<g transform="translate(50 44) scale(.55)">' + A.coolant(0, 0) + '</g>';
            s += A.txt(78, 24, 'H', 10) + A.txt(78, 105, 'C', 10);
        } else {
            s += A.txt(73, 29, 'BOOST', 9, '#dce1df');
            s += '<g id="r34BoostAuxLabels"></g>';
        }
        var valueX = temperature ? 35 : 85;
        s += A.txt(valueX, 91, 'N/A', 12.5, 'var(--r34-ink)', 'id="' + prefix + 'Value" class="r34-aux-value"');
        s += A.txt(valueX, 104, temperature ? '°C' : 'bar', 9, 'var(--r34-ink)', 'id="' + prefix + 'Unit"');
        s += '<g id="' + prefix + 'Needle" transform="' + I.auxiliaryTransform(kind, 0) + '">';
        s += A.path('M-7 -1L' + geometry.needleLength + ' 0L-7 1Z', '#d12c34');
        s += A.circle(0, 0, 9.5, '#303639', 'stroke="#464e51" stroke-width=".8"') + A.circle(0, 0, 7.5, '#151c20');
        return s + '</g></svg>';
    }
    root.R34ClusterArt = { main: main, auxiliary: auxiliary };
})(window);
