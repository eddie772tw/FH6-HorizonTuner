/* Read-only GSMTC music page for the S650 center-information registry. */
(function (window) {
    'use strict';

    var common = window.S650HmiCenterInfoCommon;

    function text(value, fallback) {
        return typeof value === 'string' && value.trim() ? value.trim() : fallback;
    }

    function number(value, fallback) {
        if (value === null || value === undefined || value === '') return fallback;
        return common.number(value, fallback);
    }

    function truncate(value, maxLength) {
        var safe = text(value, '--');
        return safe.length > maxLength ? safe.slice(0, maxLength - 1) + '…' : safe;
    }

    function formatTime(seconds) {
        var value = number(seconds, -1);
        if (value < 0) return '--:--';
        var minutes = Math.floor(value / 60);
        var remainder = Math.floor(value % 60);
        return String(minutes) + ':' + (remainder < 10 ? '0' : '') + String(remainder);
    }

    function progressRatio(media) {
        var position = number(media && media.position_seconds, -1);
        var start = number(media && media.start_seconds, 0);
        var duration = number(media && media.duration_seconds, -1);
        if (position < 0 || duration <= 0) return 0;
        return common.clamp((position - start) / duration, 0, 1);
    }

    function statusSymbol(media) {
        var status = text(media && media.status, 'none').toLowerCase();
        var symbols = {
            playing: '▶',
            paused: 'Ⅱ',
            stopped: '■',
            opened: '·',
            changing: '…',
            none: '·'
        };
        return symbols[status] || '·';
    }

    function setText(context, value, x, y, role, color, size, align) {
        var ctx = context.ctx;
        var primitives = context.primitives || {};
        if (typeof primitives.setFont === 'function') {
            var fontSize = typeof primitives.getFontSize === 'function'
                ? primitives.getFontSize(context.view, role, size)
                : size;
            primitives.setFont(fontSize, '700', 'Arial Narrow');
        }
        ctx.save();
        ctx.textAlign = align || 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.fillText(value, x, y);
        ctx.restore();
    }

    function coverInitials(media) {
        var title = text(media && media.title, '--');
        if (title === '--') return '--';
        return title.split(/\s+/).slice(0, 2).map(function (word) {
            return word.charAt(0);
        }).join('').toUpperCase().slice(0, 2);
    }

    function drawCover(context, media, x, y, size) {
        var ctx = context.ctx;
        var palette = context.palette;
        var image = media && media.thumbnail;
        var drawnImage = false;

        ctx.save();
        ctx.fillStyle = palette.surface || palette.background;
        ctx.fillRect(x, y, size, size);
        if (image && typeof image !== 'string' && typeof ctx.drawImage === 'function') {
            try {
                ctx.drawImage(image, x, y, size, size);
                drawnImage = true;
            } catch (_error) {
                drawnImage = false;
            }
        }
        if (!drawnImage) {
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = palette.primary;
            ctx.fillRect(x + size * 0.18, y + size * 0.18, size * 0.64, size * 0.64);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = palette.primary;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, size, size);
            setText(context, coverInitials(media), x + size / 2, y + size / 2, 'dualRingCenterValue', palette.text, Math.max(14, size * 0.22), 'center');
        }
        ctx.restore();
    }

    function drawProgressBar(context, x, y, width, ratio) {
        var ctx = context.ctx;
        var palette = context.palette;
        var safeWidth = Math.max(0, width);
        var safeRatio = common.clamp(number(ratio, 0), 0, 1);

        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = palette.secondary;
        ctx.fillRect(x, y, safeWidth, 6);
        ctx.globalAlpha = 1;
        ctx.fillStyle = palette.primary;
        ctx.fillRect(x, y, safeWidth * safeRatio, 6);
        ctx.restore();
    }

    function renderMusic(context, compact) {
        var media = typeof context.view.getMediaInfo === 'function'
            ? context.view.getMediaInfo()
            : {};
        var palette = context.palette;
        var region = context.region;
        var hasMedia = media && media.has_media === true;
        var pad = compact ? 8 : 20;
        var coverSize = compact ? 50 : 118;
        var coverX = region.x + pad;
        var coverY = region.y + (compact ? 10 : 24);
        var textX = coverX + coverSize + (compact ? 10 : 20);
        var textRight = region.x + region.width - pad;
        var title = hasMedia ? truncate(media.title, compact ? 22 : 26) : 'NO ACTIVE MEDIA';
        var artist = hasMedia ? truncate(media.artist, compact ? 22 : 26) : 'SYSTEM MEDIA SESSION NOT FOUND';
        var album = hasMedia ? truncate(media.album_title, compact ? 22 : 26) : 'Metadata unavailable';
        var position = formatTime(media && media.position_seconds);
        var duration = formatTime(number(media && media.start_seconds, 0) + number(media && media.duration_seconds, -1));
        var progressY = region.y + region.height - (compact ? 18 : 38);
        var timeY = progressY + (compact ? 12 : 18);

        if (!context.ctx || !common) return;

        drawCover(context, hasMedia ? media : {}, coverX, coverY, coverSize);
        setText(context, title, textX, coverY + (compact ? 12 : 28), 'dualRingCenterValue', hasMedia ? palette.text : palette.secondary, compact ? 13 : 19, 'left');
        setText(context, artist, textX, coverY + (compact ? 29 : 56), 'dualRingCenterSubtitle', palette.secondary, compact ? 10 : 13, 'left');
        setText(context, album, textX, coverY + (compact ? 44 : 82), 'dualRingCenterSubtitle', palette.secondary, compact ? 9 : 11, 'left');
        // The status is intentionally a symbol-only hint; verbose status and
        // playback type remain available in the contract but are not rendered.
        setText(context, statusSymbol(media), textRight, region.y + (compact ? 10 : 14), 'dualRingCenterSubtitle', palette.primary, compact ? 13 : 17, 'right');
        drawProgressBar(context, coverX, progressY, region.width - pad * 2, progressRatio(media));
        setText(context, position + ' / ' + duration, region.x + region.width / 2, timeY, 'captionLegal', palette.secondary, compact ? 9 : 10, 'center');
    }

    window.S650HmiCenterInfo.register({
        id: 'music',
        label: 'Music player',
        status: 'production',
        render: function (context) {
            renderMusic(context, false);
        },
        renderCompact: function (context) {
            renderMusic(context, true);
        }
    });
})(window);
