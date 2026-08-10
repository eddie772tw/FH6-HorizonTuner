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

    if (!contract || !tokens || !window.S650HmiPrimitives || !window.S650HmiLayouts || !window.S650HmiFrame) {
        console.error('[S650 HMI] Renderer modules are incomplete.');
        return;
    }

    var frame;
    var primitives;
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
        layouts = window.S650HmiLayouts.create({
            ctx: ctx,
            view: frame.view,
            primitives: primitives,
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
        scaleMultiplier: 1.0,
        onInit: frame.onInit,
        onElementsChange: frame.onElementsChange,
        onFrame: frame.onFrame,
        onAnimate: frame.onAnimate
    });

    HUDCore.init('s650_hmi');
    frame.flushPendingAnimation();
    frame.renderInitial();
})(window);
