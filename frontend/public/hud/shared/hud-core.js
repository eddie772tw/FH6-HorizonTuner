// =============================================================================
// shared/hud-core.js
// Standardized Registration Engine and Lifecycle Controller for HUD Styles.
// =============================================================================

(function (window) {
    'use strict';

    var registry = {};
    var activeStyle = null;
    var currentFullConfig = {};
    var currentElements = {};

    var HUDCore = {
        /**
         * Register a new HUD Style Definition into the Registry.
         * @param {string} id Unique identifier for the HUD style (e.g., 'simple', 'advanced')
         * @param {object} definition Style hooks and metadata:
         *   - containerId: string (e.g., 'simpleContainer')
         *   - scaleMultiplier: number (default 0.5)
         *   - onInit: function(payload)
         *   - onFrame: function(data, payload)
         *   - onElementsChange: function(elements)
         *   - onAnimate: function()
         *   - onScale: function(scale)
         */
        registerStyle: function (id, definition) {
            if (!id || typeof definition !== 'object') {
                console.error('[HUDCore] Invalid style registration:', id);
                return;
            }
            registry[id] = definition;
            console.log('[HUDCore] Registered HUD style:', id);
        },

        /**
         * Initialize and activate a registered HUD style for the current iframe window.
         * @param {string} id Unique identifier of the registered style
         * @param {object} options Override options
         */
        init: function (id, options) {
            options = options || {};
            var def = registry[id];
            if (!def) {
                console.error('[HUDCore] Style not registered in registry:', id);
                return;
            }

            activeStyle = Object.assign({}, def, options);

            // Bind Window Message Listener for Iframe Host Communication
            window.addEventListener('message', function (e) {
                var payload = (e.data && typeof e.data === 'object') ? e.data : {};
                var type = payload.type;
                if (!type) return;

                HUDCore.handleMessage(type, payload);
            });

            console.log('[HUDCore] Activated HUD style:', id);
        },

        /**
         * Standardized Message Dispatcher
         */
        handleMessage: function (type, payload) {
            if (!activeStyle) return;

            switch (type) {
                case 'config': {
                    if (payload.data) {
                        currentFullConfig = payload.data;
                        window._currentFullConfig = currentFullConfig;
                        if (payload.data.elements) {
                            currentElements = payload.data.elements;
                            window._currentHudElements = currentElements;
                        }

                        // Standardized Scale calculation
                        var multiplier = activeStyle.scaleMultiplier !== undefined ? activeStyle.scaleMultiplier : 1.0;
                        var finalScale = payload.data.actualScale ?? ((payload.data.scale || 1.0) * multiplier);
                        window._currentHudScale = finalScale;

                        var container = activeStyle.containerId ? document.getElementById(activeStyle.containerId) : null;
                        if (container) {
                            container.style.zoom = finalScale;
                        }

                        if (activeStyle.onScale) {
                            activeStyle.onScale(finalScale);
                        }

                        // Update shared Telemetry Cards
                        if (window.TelemetryCardsManager) {
                            window.TelemetryCardsManager.update(null, currentFullConfig);
                        }

                        if (activeStyle.onInit) {
                            activeStyle.onInit(currentFullConfig);
                        }
                    }
                    break;
                }

                case 'hud:elements': {
                    currentElements = payload || {};
                    if (!currentFullConfig) currentFullConfig = {};
                    currentFullConfig.elements = currentElements;
                    window._currentHudElements = currentElements;

                    // Standard Gauge Container Visibility
                    var container = activeStyle.containerId ? document.getElementById(activeStyle.containerId) : null;
                    if (container) {
                        container.style.display = currentElements.showGauge === false ? 'none' : 'block';
                    }

                    if (activeStyle.onElementsChange) {
                        activeStyle.onElementsChange(currentElements);
                    }

                    if (window.TelemetryCardsManager) {
                        window.TelemetryCardsManager.update(null, currentFullConfig);
                    }
                    break;
                }

                case 'hud:frame': {
                    var data = payload.data || {};

                    // Always update shared Telemetry Cards regardless of sweep animation state
                    if (window.TelemetryCardsManager) {
                        window.TelemetryCardsManager.update(data, currentFullConfig || { elements: currentElements });
                    }

                    if (activeStyle.onFrame) {
                        activeStyle.onFrame(data, payload);
                    }
                    break;
                }

                case 'hud:init': {
                    if (activeStyle.onInit) {
                        activeStyle.onInit(payload);
                    }
                    if (activeStyle.onAnimate) {
                        activeStyle.onAnimate();
                    }
                    if (window.TelemetryCardsManager && window.TelemetryCardsManager.triggerClusterSweepAnimation) {
                        window.TelemetryCardsManager.triggerClusterSweepAnimation();
                    }
                    break;
                }

                case 'hud:animate': {
                    if (activeStyle.onAnimate) {
                        activeStyle.onAnimate();
                    }
                    if (window.TelemetryCardsManager && window.TelemetryCardsManager.triggerClusterSweepAnimation) {
                        window.TelemetryCardsManager.triggerClusterSweepAnimation();
                    }
                    break;
                }

                case 'hud:scale': {
                    if (window._currentHudScale) {
                        var container = activeStyle.containerId ? document.getElementById(activeStyle.containerId) : null;
                        if (container) {
                            container.style.zoom = window._currentHudScale;
                        }
                    }
                    break;
                }
            }
        },

        // Helper getters
        getRegistry: function () { return registry; },
        getActiveStyle: function () { return activeStyle; },
        getCurrentConfig: function () { return currentFullConfig; },
        getCurrentElements: function () { return currentElements; }
    };

    window.HUDCore = HUDCore;

})(window);
