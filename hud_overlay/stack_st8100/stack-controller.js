(function (root) {
    'use strict';
    const container = document.getElementById('stackContainer'), canvas = document.getElementById('stackCanvas');
    if (!container || !canvas || !root.HUDCore) return;
    const state = root.StackMonitor.create(), R = root.StackRenderer;
    const renderer = R.create(canvas, document, R.palette(getComputedStyle(document.documentElement)));
    let active = true, sweepStart = null, raf = null, timer = null;
    const SWEEP_MS = 1350;
    function animate(now) { raf = null; render(now); }
    function render(now) {
        if (!active) return;
        root.StackMonitor.tick(state, now);
        R.resize(renderer, root.devicePixelRatio);
        let sweep = null;
        if (sweepStart !== null) {
            const progress = (now - sweepStart) / SWEEP_MS;
            if (progress >= 1 || state.status === 'LIVE') { sweepStart = null; renderer.lastLCD = -Infinity; }
            else sweep = progress < .55 ? progress / .55 : 1 - (progress - .55) / .45;
        }
        R.draw(renderer, state, now, sweep);
        if (sweepStart !== null && raf === null) raf = requestAnimationFrame(animate);
        else if (sweepStart === null && raf !== null) { cancelAnimationFrame(raf); raf = null; }
    }
    function configure(payload) {
        root.StackMonitor.configure(state, payload);
        container.style.display = state.settings.showGauge ? 'block' : 'none';
        renderer.lastLCD = -Infinity; render(performance.now());
    }
    function stop() {
        active = false;
        if (raf !== null) cancelAnimationFrame(raf);
        if (timer !== null) clearInterval(timer);
        raf = null; timer = null; root.StackMonitor.clearWarnings(state);
    }
    function message(event) { if (event.data?.type === 'hud:destroy') stop(); }
    root.HUDCore.registerStyle('stack_st8100', {
        containerId: 'stackContainer', scaleBaseline: 1, scaleMultiplier: .95, globalScaleFactor: .75,
        onInit: configure,
        onElementsChange: function (elements) { configure({ elements }); },
        onFrame: function (data, payload) { root.StackMonitor.ingest(state, data, payload, performance.now()); render(performance.now()); },
        onAnimate: function () {
            if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
            // A self-test cannot masquerade as a live engine or update monitoring state.
            sweepStart = performance.now(); renderer.lastLCD = -Infinity; render(sweepStart);
        },
    });
    root.HUDCore.init('stack_st8100');
    timer = setInterval(function () { if (sweepStart === null) render(performance.now()); }, 100);
    root.addEventListener('message', message);
    root.addEventListener('pagehide', function () { stop(); root.removeEventListener('message', message); });
    render(performance.now());
})(window);
