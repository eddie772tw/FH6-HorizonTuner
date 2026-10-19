/* Shared artwork preparation. Run once per image, never in the telemetry loop. */
(function (root) {
    'use strict';

    function softenBackground(pixels, opacity) {
        for (var i = 0; i < pixels.length; i += 4) {
            var brightness = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
            // Keep illuminated markings intact; feather the dark glass into them.
            var foreground = Math.min(1, Math.max(0, (brightness - 24) / 32));
            pixels[i + 3] = Math.round(pixels[i + 3] * (opacity + (1 - opacity) * foreground));
        }
        return pixels;
    }

    function loadImage(src, opacity) {
        var img = new Image();
        var prepared = false;
        img.addEventListener('load', function (event) {
            if (prepared) return;
            var surface = document.createElement('canvas');
            surface.width = img.naturalWidth;
            surface.height = img.naturalHeight;
            var ctx = surface.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            var pixels = ctx.getImageData(0, 0, surface.width, surface.height);
            softenBackground(pixels.data, opacity === undefined ? 0.18 : opacity);
            ctx.putImageData(pixels, 0, 0);
            prepared = true;
            event.stopImmediatePropagation();
            img.src = surface.toDataURL('image/png');
        });
        img.src = src;
        return img;
    }

    function watchCanvas(canvas, render) {
        var width = canvas.width;
        var height = canvas.height;
        function resize() {
            var bounds = canvas.getBoundingClientRect();
            var dpr = window.devicePixelRatio || 1;
            var pixelWidth = Math.max(1, Math.round(bounds.width * dpr));
            var pixelHeight = Math.max(1, Math.round(bounds.height * dpr));
            if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
                canvas.width = pixelWidth;
                canvas.height = pixelHeight;
                canvas.getContext('2d').setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
            }
            render();
        }
        window.addEventListener('resize', resize);
        return resize;
    }

    root.HUDArtwork = { loadImage: loadImage, softenBackground: softenBackground, watchCanvas: watchCanvas };
})(globalThis);
