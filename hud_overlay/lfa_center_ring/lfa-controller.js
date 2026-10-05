(function (window, document) {
    'use strict';
    const model = window.LfaModel;
    const state = model.newState();
    const renderer = window.LfaRenderer.create(document, model);
    const expansion = window.LfaExpansion;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let motion = expansion.createMotion(false), expansionConfigured = false;
    let raf = null, destroyed = false, checkStart = null;
    const media = window.LfaMedia.create({ fetch: window.fetch?.bind(window), now: () => window.performance.now(),
        setTimeout: window.setTimeout?.bind(window), clearTimeout: window.clearTimeout?.bind(window), AbortController: window.AbortController,
        onChange: () => paint(window.performance.now()) });
    function paint(now) {
        if (destroyed) return;
        let check = checkStart === null ? null : Math.min(1, (now - checkStart) / 750);
        if (check === 1) { check = null; checkStart = null; }
        const view = model.view(state, now);
        view.media = media.view(now);
        const policy = expansion.layoutPolicy(state.settings, view.confirmedRace, view.media.available);
        view.expandedPage = policy.page;
        expansion.advanceMotion(motion, policy.expanded, now, reducedMotion?.matches === true);
        if (state.settings.showGauge) renderer.render(view, check, state.settings, motion);
    }
    function loop(now) {
        if (destroyed) return;
        paint(now);
        raf = window.requestAnimationFrame(loop);
    }
    function configure(payload) {
        if (destroyed) return;
        state.settings = model.config(payload, state.settings);
        media.setEnabled(state.settings.showGauge && (state.settings.lfaManualExpand || state.settings.lfaAutoExpand));
        if (!expansionConfigured && ['lfaManualExpand', 'lfaAutoExpand'].some(key => Object.prototype.hasOwnProperty.call(payload, key))) {
            // First persisted expansion config is the starting layout, not a user-toggle animation.
            motion = expansion.createMotion(model.view(state, window.performance.now()).expansionTarget);
            expansionConfigured = true;
        }
        renderer.palette(state.settings);
        renderer.visibility(state.settings.showGauge);
        paint(window.performance.now());
    }
    function resize() {
        if (destroyed) return;
        renderer.resize(); paint(window.performance.now());
    }
    function motionPreferenceChanged() { paint(window.performance.now()); }
    function destroy() {
        if (destroyed) return;
        destroyed = true; checkStart = null;
        if (raf !== null) window.cancelAnimationFrame(raf);
        raf = null;
        window.removeEventListener('resize', resize);
        window.removeEventListener('pagehide', destroy);
        window.removeEventListener('message', lifecycle);
        reducedMotion?.removeEventListener?.('change', motionPreferenceChanged);
        media.destroy(); renderer.destroy?.();
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
        onMedia: snapshot => { if (!destroyed) media.accept(snapshot); },
        onScale: resize,
    });
    window.addEventListener('message', lifecycle);
    window.addEventListener('pagehide', destroy);
    window.addEventListener('resize', resize);
    reducedMotion?.addEventListener?.('change', motionPreferenceChanged);
    window.HUDCore.init('lfa_center_ring');
    renderer.resize(); configure({});
    raf = window.requestAnimationFrame(loop);
})(window, document);
