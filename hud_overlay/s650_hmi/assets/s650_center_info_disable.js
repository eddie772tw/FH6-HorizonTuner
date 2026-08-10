/* Explicit blank center-information page. */
(function (window) {
    'use strict';

    window.S650HmiCenterInfo.register({
        id: 'disable',
        label: 'Disable',
        status: 'production',
        render: function () {
            // Intentionally blank. The surrounding S650 cluster remains active.
        }
    });
})(window);
