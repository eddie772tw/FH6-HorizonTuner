/*
 * S650 HMI renderer facade.
 *
 * HUDCore only sees this lifecycle adapter. Data normalization, tokens,
 * primitives and dashboard layouts are loaded from sibling modules so the
 * 60 Hz path remains Canvas-only and the public HUD contract stays stable.
 */
(function (window) {
    'use strict';

    if (!window.HUDCore) {
        console.error('[S650 HMI] HUDCore is not available. Renderer was not registered.');
        return;
    }

    var contract = window.S650HmiContract;
    var tokens = window.S650HmiTokens;
    var canvas = document.getElementById('s650Canvas');
    var ctx = canvas ? canvas.getContext('2d') : null;
    var container = document.getElementById('s650Container');

    if (!contract || !tokens || !window.S650HmiPrimitives || !window.S650HmiCenterInfo || !window.S650HmiLayouts || !window.S650HmiFrame) {
        console.error('[S650 HMI] Renderer modules are incomplete.');
        return;
    }

    var frame;
    var primitives;
    var centerInfo;
    var layouts;

    if (ctx) {
        var layoutHost = { render: function () {} };
        frame = window.S650HmiFrame.create({
            canvas: canvas,
            ctx: ctx,
            container: container,
            contract: contract,
            tokens: tokens,
            layouts: layoutHost
        });
        primitives = window.S650HmiPrimitives.create(ctx, contract);
        centerInfo = window.S650HmiCenterInfo.create({
            ctx: ctx,
            primitives: primitives,
            contract: contract
        });
        layouts = window.S650HmiLayouts.create({
            ctx: ctx,
            contract: contract,
            view: frame.view,
            primitives: primitives,
            centerInfo: centerInfo,
            width: contract.canvas.width,
            height: contract.canvas.height
        });

        // The frame controller keeps the host object by reference. Wiring the
        // dispatcher after construction avoids a circular module dependency.
        layoutHost.render = layouts.render;
    } else {
        frame = window.S650HmiFrame.create({
            canvas: canvas,
            ctx: ctx,
            container: container,
            contract: contract,
            tokens: tokens,
            layouts: { render: function () {} }
        });
    }

    HUDCore.registerStyle('s650_hmi', {
        containerId: 's650Container',
        // The native cluster is now the real 8:3 proportion. Keep its default
        // footprint practical in an overlay while preserving the user scale.
        scaleMultiplier: 0.75,
        onInit: frame.onInit,
        onElementsChange: frame.onElementsChange,
        onFrame: frame.onFrame,
        onAnimate: frame.onAnimate
    });

    HUDCore.init('s650_hmi');
    frame.flushPendingAnimation();
    frame.renderInitial();

    // Canvas text is rasterized at draw time. Repaint after @font-face assets
    // settle so Heritage dial typography never remains on a fallback face.
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
            frame.renderInitial();
        });
    }
})(window);
