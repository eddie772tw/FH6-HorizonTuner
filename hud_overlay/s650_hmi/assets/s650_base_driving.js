/* S650 base driving layer. Core road information never depends on center-info pages. */
(function (window) {
    'use strict';

    function createBaseDriving(options) {
        var primitives = options.primitives;

        function draw(view, data, palette, region) {
            region = region || {};
            var carousel = region.carousel || {};

            if (carousel.enabled !== false) {
                primitives.drawGearCarousel(
                    view,
                    data,
                    palette,
                    carousel.centerX,
                    carousel.y
                );
            }
        }

        return {
            draw: draw
        };
    }

    window.S650HmiBaseDriving = {
        create: createBaseDriving
    };
})(window);
