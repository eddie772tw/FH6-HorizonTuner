(function (window, document) {
    'use strict';
    const model = window.LfaModel;
    const state = model.newState();
    const renderer = window.LfaRenderer.create(document, model);
    let raf = null, destroyed = false, checkStart = null;
    function paint(now) {
        if (destroyed) return;
        let check = checkStart === null ? null : Math.min(1, (now - checkStart) / 750);
        if (check === 1) { check = null; checkStart = null; }
        if (state.settings.showGauge) renderer.render(model.view(state, now), check, state.settings);
    }
    function loop(now) {
        if (destroyed) return;
        paint(now);
        raf = window.requestAnimationFrame(loop);
    }
    function configure(payload) {
        if (destroyed) return;
        state.settings = model.config(payload, state.settings);
        renderer.palette(state.settings);
        renderer.visibility(state.settings.showGauge);
        paint(window.performance.now());
    }
    function resize() {
        if (destroyed) return;
        renderer.resize(); paint(window.performance.now());
    }
    function destroy() {
        if (destroyed) return;
        destroyed = true; checkStart = null;
        if (raf !== null) window.cancelAnimationFrame(raf);
        raf = null;
        window.removeEventListener('resize', resize);
        window.removeEventListener('pagehide', destroy);
        window.removeEventListener('message', lifecycle);
        state.latest = null;
    }
    function lifecycle(event) {
        if (event.data?.type === 'hud:destroy') destroy();
    }
    window.HUDCore.registerStyle('lfa_center_ring', {
        containerId: 'lfaContainer', scaleMultiplier: 1, globalScaleFactor: .75,
        onInit: configure,
        onElementsChange: (elements) => configure({ elements }),
        onFrame: (data, payload) => {
            if (destroyed) return;
            model.ingest(state, data, payload, window.performance.now());
            // Fresh telemetry ends the decorative check; never manufacture driving values for a sweep.
            if (model.view(state, window.performance.now()).live) checkStart = null;
        },
        onAnimate: () => { if (!destroyed) checkStart = window.performance.now(); },
        onScale: resize,
    });
    window.addEventListener('message', lifecycle);
    window.addEventListener('pagehide', destroy);
    window.addEventListener('resize', resize);
    window.HUDCore.init('lfa_center_ring');
    renderer.resize(); configure({});
    raf = window.requestAnimationFrame(loop);
})(window, document);
