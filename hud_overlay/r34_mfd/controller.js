(function (root) {
    'use strict';
    var M = root.R34Model, state = M.createState(), config = {}, view = {};
    var renderer = new root.R34Renderer(document), displayUnits = M.units(config, {});
    var frameId = null, resizeId = null, destroyed = false, lastRender = -Infinity, currentScale = 1;
    var observer = null, dprQuery = null, appliedDpr = null;
    function resize() {
        if (resizeId !== null) cancelAnimationFrame(resizeId);
        resizeId = null; if (destroyed) return;
        appliedDpr = root.devicePixelRatio || 1;
        renderer.resizeCanvases(currentScale, appliedDpr); lastRender = -Infinity;
    }
    function queueResize() { if (!destroyed && resizeId === null) resizeId = requestAnimationFrame(resize); }
    function watchDpr() {
        if (dprQuery) dprQuery.removeEventListener('change', onDprChange);
        if (typeof root.matchMedia !== 'function') return;
        dprQuery = root.matchMedia('(resolution: ' + (root.devicePixelRatio || 1) + 'dppx)');
        dprQuery.addEventListener('change', onDprChange);
    }
    function onDprChange() { watchDpr(); queueResize(); }
    function configure(next) {
        config = Object.assign({ elements: {} }, next || {}); displayUnits = M.units(config, state.data);
        renderer.configure(config); resize();
    }
    function frame(data, payload) { M.ingest(state, data, payload, performance.now()); }
    function render(now) {
        if (destroyed) return;
        // Resolution-query events may miss a rapid return to an earlier DPR.
        // This cached scalar check schedules a boundary resize; it reads no DOM
        // dimensions and allocates nothing during unchanged animation frames.
        if ((root.devicePixelRatio || 1) !== appliedDpr) queueResize();
        // Bounded 30 Hz text/graph cadence with cached logical canvas geometry.
        if (now - lastRender >= 1000 / 30) {
            M.snapshot(state, config, now, view, displayUnits); renderer.render(view, state, config); lastRender = now;
        }
        frameId = requestAnimationFrame(render);
    }
    function destroy() {
        destroyed = true;
        if (frameId !== null) cancelAnimationFrame(frameId);
        if (resizeId !== null) cancelAnimationFrame(resizeId);
        frameId = resizeId = null; observer?.disconnect();
        root.removeEventListener('resize', queueResize);
        dprQuery?.removeEventListener('change', onDprChange);
    }
    root.HUDCore.registerStyle('r34_mfd', {
        containerId: 'r34Container', scaleMultiplier: 0.88,
        onInit: configure, onFrame: frame,
        onScale: function (scale) { currentScale = scale; resize(); },
        onElementsChange: function (elements) { configure(Object.assign({}, config, { elements: elements })); },
        onAnimate: function () { lastRender = -Infinity; }
    });
    root.HUDCore.init('r34_mfd'); configure({});
    if (typeof root.ResizeObserver === 'function') {
        observer = new root.ResizeObserver(queueResize);
        observer.observe(document.getElementById('r34History')); observer.observe(document.getElementById('r34G'));
    }
    watchDpr(); root.addEventListener('resize', queueResize); frameId = requestAnimationFrame(render);
    root.addEventListener('pagehide', destroy);
    root.addEventListener('message', function (event) { if (event.data && event.data.type === 'hud:destroy') destroy(); });
    // Fixture observability; inputs still enter through HUDCore.
    root.R34Hud = { state: state, view: view, render: function (now) { M.snapshot(state, config, now, view, displayUnits); renderer.render(view, state, config); } };
})(window);
