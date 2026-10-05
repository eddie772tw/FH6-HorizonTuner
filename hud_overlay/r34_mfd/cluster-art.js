/* Original core faces. Viewport composition is separate from the R34 dial geometry. */
(function (root) {
    'use strict';
    var A = root.R34Artwork;
    function open(label, size) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + label + '">'; }
    function main(kind) {
        var tach = kind === 'tach', cx = 108, cy = 108;
        var s = open(tach ? 'Stock two-stage 10000 rpm R34 scale' : 'Nür 300 kmh R34 speed scale', 216);
        s += A.dial(cx, cy, 105);
        s += '<g id="' + (tach ? 'r34TachFace' : 'r34SpeedFace') + '">';
        var limit = tach ? 10000 : root.R34Instruments.SPEED_MAX, step = tach ? 200 : 10;
        for (var v = 0; v <= limit; v += step) {
            var major = v % (tach ? 1000 : 20) === 0;
            var angle = tach ? root.R34Instruments.tachAngle(v) : root.R34Instruments.speedAngle(v);
            s += A.tick(cx, cy, major ? 92 : 97, 102, angle, tach && v >= 8000 ? '#b02a32' : '#e1e3df', major ? 2.2 : 1.1);
            if (major) {
                var p = A.pt(cx, cy, tach ? 77 : 78, angle);
                s += A.digits(p[0], p[1], tach ? v / 1000 : v, tach ? (v < 3000 ? 14 : 17) : 13, '#e1e3df', tach ? 1.9 : 2.5, true, tach ? 1.12 : .88);
            }
        }
        // The original Nür face has a closely paired reference mark below zero.
        if (!tach) s += A.tick(cx, cy, 94, 102, 142, '#e1e3df', 1.4);
        s += A.txt(cx, cy - 33, tach ? 'x1000r/min' : 'kmh', 11, '#dadeda', 'font-style="italic"') + '</g>';
        if (!tach) {
            s += A.rect(cx - 44, cy + 64, 88, 23, '#0c1013', 'rx="3" stroke="#393e3d" stroke-width="1"');
            s += A.rect(cx - 41, cy + 67, 82, 17, 'url(#lcd)', 'rx="1"');
            s += A.txt(cx - 4, cy + 80, '—', 15, 'var(--r34-lcd-ink)', 'id="r34Distance" class="r34-lcd-readout"');
            s += A.txt(cx + 32, cy + 80, 'km', 5, '#455241', 'id="r34DistanceUnit"');
        }
        s += A.needle(cx, cy, 96, tach ? 135 : 145, tach ? 'r34TachNeedle' : 'r34SpeedNeedle');
        return s + '</svg>';
    }
    function auxiliary(kind) {
        var temperature = kind === 'temperature', prefix = temperature ? 'r34Temp' : 'r34Boost';
        var s = open(temperature ? 'Four-wheel average tire temperature, cold to hot' : 'Boost pressure', 120);
        s += A.dial(60, 60, 54);
        for (var n = 0; n <= 10; n++) s += A.tick(60, 60, n % 5 === 0 ? 45 : 48, 51, 120 + n * 12, '#d9dddd', n % 5 === 0 ? 1.6 : .8);
        if (temperature) {
            s += A.txt(83, 36, 'TIRE', 9, '#dce1df') + A.txt(83, 46, 'TEMP', 9, '#dce1df');
            s += '<g transform="translate(84 60) scale(.55)">' + A.coolant(0, 0) + '</g>';
            s += A.txt(41, 28, 'H', 11) + A.txt(41, 96, 'C', 11);
        } else {
            s += A.txt(82, 36, 'BOOST', 9.5, '#dce1df');
            s += '<g id="r34BoostAuxLabels"></g>';
        }
        s += A.txt(82, 85, 'N/A', 14, 'var(--r34-ink)', 'id="' + prefix + 'Value" class="r34-aux-value"');
        s += A.txt(82, 97, temperature ? '°C' : 'bar', 10, 'var(--r34-ink)', 'id="' + prefix + 'Unit"');
        s += '<g id="' + prefix + 'Needle" transform="translate(60 60) rotate(120)">';
        s += A.path('M-7 -1L46 0L-7 1Z', '#d12c34');
        s += A.circle(0, 0, 5, '#24292d', 'stroke="#454e52" stroke-width=".8"');
        return s + '</g></svg>';
    }
    root.R34ClusterArt = { main: main, auxiliary: auxiliary };
})(window);
