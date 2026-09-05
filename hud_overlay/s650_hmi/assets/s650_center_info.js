/* S650 center-information registry and Canvas container. */
(function (window) {
    'use strict';

    var pageRegistry = Object.create(null);

    function validatePageDefinition(definition) {
        if (!definition || typeof definition !== 'object') {
            throw new TypeError('[S650 Center Info] Page definition must be an object.');
        }
        if (!definition.id || typeof definition.id !== 'string') {
            throw new TypeError('[S650 Center Info] Page definition requires a string id.');
        }
        if (typeof definition.render !== 'function') {
            throw new TypeError('[S650 Center Info] Page definition requires a render function.');
        }
        if (definition.renderCompact !== undefined && typeof definition.renderCompact !== 'function') {
            throw new TypeError('[S650 Center Info] Compact page renderer must be a function.');
        }
        if (pageRegistry[definition.id]) {
            throw new Error('[S650 Center Info] Duplicate page id: ' + definition.id);
        }
    }

    function register(definition) {
        validatePageDefinition(definition);
        pageRegistry[definition.id] = Object.freeze({
            id: definition.id,
            label: definition.label || definition.id,
            status: definition.status || 'experimental',
            render: definition.render,
            renderCompact: definition.renderCompact || null
        });
    }

    function list() {
        return Object.keys(pageRegistry);
    }

    function numberOr(value, fallback) {
        return typeof value === 'number' && isFinite(value) ? value : fallback;
    }

    function normalizeLayoutStyle(region) {
        if (region && region.layoutStyle === 'trackSidebar') return 'trackSidebar';
        // Compatibility for recipes created before layoutStyle was explicit.
        return region && region.variant === 'trackCompact' ? 'trackSidebar' : 'dualRing';
    }

    function normalizeRegion(region) {
        region = region && typeof region === 'object' ? region : {};
        var normalized = {
            x: numberOr(region.x, 425),
            y: numberOr(region.y, 126),
            width: numberOr(region.width, 430),
            height: numberOr(region.height, 230)
        };
        ['centerX', 'speedY', 'gearY', 'speedSize', 'gearSize'].forEach(function (key) {
            if (typeof region[key] === 'number' && isFinite(region[key])) {
                normalized[key] = region[key];
            }
        });
        var layoutStyle = normalizeLayoutStyle(region);
        normalized.layout = Object.freeze({
            style: layoutStyle,
            aspectRatio: normalized.height > 0 ? normalized.width / normalized.height : 1,
            isCompact: layoutStyle === 'trackSidebar'
        });
        return normalized;
    }

    function create(options) {
        options = options || {};
        var primitives = options.primitives || {};
        var ctx = options.ctx || null;
        var contract = options.contract;
        var supportedWidgets = contract && Array.isArray(contract.centerWidgets)
            ? contract.centerWidgets
            : ['drive', 'tire_temp', 'performance', 'music'];

        function normalizeWidget(view) {
            var candidate = view && view.centerWidget;
            if (supportedWidgets.indexOf(candidate) >= 0 && pageRegistry[candidate]) {
                return candidate;
            }
            return pageRegistry.drive ? 'drive' : list()[0];
        }

        function render(view, data, palette, region) {
            var pageId = normalizeWidget(view);
            var page = pageRegistry[pageId];
            if (!page) return;

            var normalizedRegion = normalizeRegion(region);

            var context = {
                view: view,
                data: data,
                palette: palette,
                region: normalizedRegion,
                primitives: primitives,
                ctx: ctx
            };
            if (pageId !== 'disable' && window.S650HmiCenterInfoCommon && typeof window.S650HmiCenterInfoCommon.drawBackground === 'function') {
                window.S650HmiCenterInfoCommon.drawBackground(context);
            }
            (normalizedRegion.layout.isCompact && typeof page.renderCompact === 'function' ? page.renderCompact : page.render)(context);

        }

        return {
            draw: function (view, data, palette, x, y, width, height) {
                var region = x && typeof x === 'object'
                    ? x
                    : { x: x, y: y, width: width, height: height };
                render(view, data, palette, region);
            },
            normalizeWidget: normalizeWidget,
            render: render,
            widgets: list()
        };
    }

    window.S650HmiCenterInfo = {
        create: create,
        list: list,
        register: register
    };
})(window);
