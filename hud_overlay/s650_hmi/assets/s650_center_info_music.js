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

    function formatTrack(media) {
        var track = number(media && media.track_number, -1);
        var total = number(media && media.album_track_count, -1);
        if (track < 0 && total < 0) return '--';
        return (track < 0 ? '--' : String(Math.round(track))) + ' / ' +
            (total < 0 ? '--' : String(Math.round(total)));
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

    function statusLabel(media) {
        var status = text(media && media.status, 'none').toUpperCase();
        var type = text(media && media.playback_type, 'media').toUpperCase();
        return status + ' · ' + type;
    }

    function setCenteredText(context, value, y, role, color, size) {
        var ctx = context.ctx;
        var primitives = context.primitives || {};
        if (typeof primitives.setFont === 'function') {
            var fontSize = typeof primitives.getFontSize === 'function'
                ? primitives.getFontSize(context.view, role, size)
                : size;
            primitives.setFont(fontSize, '700', 'Arial Narrow');
        }
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.fillText(value, context.region.x + context.region.width / 2, y);
        ctx.restore();
    }

    window.S650HmiCenterInfo.register({
        id: 'music',
        label: 'Music player',
        status: 'production',
        render: function (context) {
            var ctx = context.ctx;
            var media = typeof context.view.getMediaInfo === 'function'
                ? context.view.getMediaInfo()
                : {};
            var palette = context.palette;
            var region = context.region;
            if (!ctx || !common) return;

            var hasMedia = media && media.has_media === true;
            var title = hasMedia ? truncate(media.title, 34) : 'NO ACTIVE MEDIA';
            var artist = hasMedia ? truncate(media.artist, 34) : 'SYSTEM MEDIA SESSION NOT FOUND';
            var album = hasMedia ? truncate(media.album_title, 30) : 'Metadata unavailable';
            var genres = hasMedia && Array.isArray(media.genres) && media.genres.length
                ? truncate(media.genres.join(' / '), 22)
                : '--';
            var position = formatTime(media && media.position_seconds);
            var duration = formatTime(number(media && media.start_seconds, 0) + number(media && media.duration_seconds, -1));

            common.drawTitle(context, 'MUSIC PLAYER', statusLabel(media));
            setCenteredText(context, title, region.y + 58, 'dualRingCenterValue', hasMedia ? palette.text : palette.secondary, 20);
            setCenteredText(context, artist, region.y + 84, 'dualRingCenterSubtitle', palette.secondary, 13);
            setCenteredText(context, album, region.y + 108, 'dualRingCenterSubtitle', palette.secondary, 11);
            common.drawMetric(context, region.x + 106, region.y + 145, 'TRACK', formatTrack(media), '', 'center');
            common.drawMetric(context, region.x + region.width - 106, region.y + 145, 'GENRE', genres, '', 'center');
            common.drawBar(context, region.x + 38, region.y + 191, region.width - 76, progressRatio(media), palette.primary, 'PLAY');
            setCenteredText(context, position + ' / ' + duration, region.y + 217, 'captionLegal', palette.secondary, 10);
        },
        renderCompact: function (context) {
            var media = typeof context.view.getMediaInfo === 'function'
                ? context.view.getMediaInfo()
                : {};
            var hasMedia = media && media.has_media === true;
            common.drawTitle(context, 'MUSIC', statusLabel(media));
            setCenteredText(context, hasMedia ? truncate(media.title, 27) : 'NO MEDIA', context.region.y + 53, 'dualRingCenterValue', hasMedia ? context.palette.text : context.palette.secondary, 16);
            setCenteredText(context, hasMedia ? truncate(media.artist, 27) : 'SESSION UNAVAILABLE', context.region.y + 73, 'dualRingCenterSubtitle', context.palette.secondary, 10);
        }
    });
})(window);
