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
            render: definition.render
        });
    }

    function list() {
        return Object.keys(pageRegistry);
    }

    function numberOr(value, fallback) {
        return typeof value === 'number' && isFinite(value) ? value : fallback;
    }

    function normalizeRegion(region) {
        region = region && typeof region === 'object' ? region : {};
        var normalized = {
            x: numberOr(region.x, 425),
            y: numberOr(region.y, 122),
            width: numberOr(region.width, 430),
            height: numberOr(region.height, 210)
        };
        ['centerX', 'speedY', 'gearY', 'speedSize', 'gearSize'].forEach(function (key) {
            if (typeof region[key] === 'number' && isFinite(region[key])) {
                normalized[key] = region[key];
            }
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
            : ['drive', 'tire_temp', 'performance'];

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

            page.render({
                view: view,
                data: data,
                palette: palette,
                region: normalizeRegion(region),
                primitives: primitives,
                ctx: ctx
            });
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
