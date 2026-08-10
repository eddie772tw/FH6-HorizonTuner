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

    function create(options) {
        var primitives = options.primitives;
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
                region: region,
                primitives: primitives
            });
        }

        return {
            draw: function (view, data, palette, x, y, width, height) {
                render(view, data, palette, {
                    x: x || 425,
                    y: y || 122,
                    width: width || 430,
                    height: height || 210
                });
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
