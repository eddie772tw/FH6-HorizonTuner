/* Drive-summary center-information page. */
(function (window) {
    'use strict';

    window.S650HmiCenterInfo.register({
        id: 'drive',
        label: 'Drive summary',
        status: 'production',
        render: function (context) {
            // Core speed and gear belong to the selected theme's dial and
            // lower carousel. This page remains a registry slot for a future
            // non-core drive summary and must not render either value.
        }
    });
})(window);
