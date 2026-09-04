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

    var cachedInitialsTitle = null;
    var cachedInitials = '--';

    function coverInitials(media) {
        var title = text(media && media.title, '--');
        if (title === '--') return '--';
        if (title === cachedInitialsTitle) return cachedInitials;

        var initials = '';
        var atWordStart = true;
        for (var i = 0; i < title.length && initials.length < 2; i++) {
            var character = title.charAt(i);
            var isWhitespace = /\s/.test(character);
            if (isWhitespace) {
                atWordStart = true;
            } else if (atWordStart) {
                initials += character.toUpperCase();
                atWordStart = false;
            }
        }
        cachedInitialsTitle = title;
        cachedInitials = initials || '--';
        return cachedInitials;
    }

    var currentThumbUrl = null;
    var loadedThumbnailImage = null;
    var isThumbLoading = false;

    function drawCover(context, media, x, y, size) {
        var ctx = context.ctx;
        var palette = context.palette;
        var drawnImage = false;

        // If media provides a pre-instantiated Image/Canvas object (e.g. in tests), use it directly
        var directImage = media && media.thumbnail && typeof media.thumbnail !== 'string' ? media.thumbnail : null;
        var thumbUrl = media && (media.thumbnail_url || (typeof media.thumbnail === 'string' ? media.thumbnail : null));

        if (!directImage && typeof Image !== 'undefined') {
            if (thumbUrl && thumbUrl !== currentThumbUrl) {
                currentThumbUrl = thumbUrl;
                loadedThumbnailImage = null;
                isThumbLoading = true;
                var img = new Image();
                img.onload = function () {
                    if (currentThumbUrl === thumbUrl) {
                        loadedThumbnailImage = img;
                        isThumbLoading = false;
                        if (context.view && typeof context.view.requestRender === 'function') {
                            context.view.requestRender();
                        }
                    }
                };
                img.onerror = function () {
                    if (currentThumbUrl === thumbUrl) {
                        loadedThumbnailImage = null;
                        isThumbLoading = false;
                    }
                };
                img.src = thumbUrl;
            } else if (!thumbUrl && currentThumbUrl !== null) {
                currentThumbUrl = null;
                loadedThumbnailImage = null;
                isThumbLoading = false;
            }
        }

        var imageToDraw = directImage || loadedThumbnailImage;

        ctx.save();
        ctx.fillStyle = palette.surface || palette.background;
        ctx.fillRect(x, y, size, size);
        if (imageToDraw && typeof ctx.drawImage === 'function') {
            try {
                var isComplete = typeof imageToDraw.complete === 'boolean'
                    ? imageToDraw.complete && imageToDraw.naturalWidth > 0
                    : true;
                if (isComplete) {
                    ctx.drawImage(imageToDraw, x, y, size, size);
                    drawnImage = true;
                }
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

    var MUSIC_LAYOUT_SPECS = Object.freeze({
        dualRing: Object.freeze({
            id: 'dualRing',
            padX: 52,
            padY: 20,
            coverSize: 88,
            coverOffsetY: 20,
            textOffsetX: 16,
            titleOffsetY: 22,
            artistOffsetY: 48,
            albumOffsetY: 72,
            titleSize: 18,
            artistSize: 13,
            albumSize: 11,
            symbolSize: 16,
            symbolOffsetY: 14,
            maxTitleLength: 22,
            maxArtistLength: 26,
            maxAlbumLength: 26,
            progressOffsetY: 38,
            progressHeight: 6,
            timeOffsetY: 18,
            timeSize: 10
        }),
        trackSidebar: Object.freeze({
            id: 'trackSidebar',
            padX: 8,
            padY: 6,
            coverSize: 46,
            coverOffsetY: 6,
            textOffsetX: 8,
            titleOffsetY: 10,
            artistOffsetY: 24,
            albumOffsetY: 37,
            titleSize: 12,
            artistSize: 10,
            albumSize: 9,
            symbolSize: 12,
            symbolOffsetY: 8,
            maxTitleLength: 16,
            maxArtistLength: 18,
            maxAlbumLength: 18,
            progressOffsetY: 18,
            progressHeight: 4,
            timeOffsetY: 11,
            timeSize: 8
        })
    });

    function resolveLayoutSpec(context, spec) {
        if (spec && typeof spec === 'object') {
            return spec;
        }
        if (spec === true) {
            return MUSIC_LAYOUT_SPECS.trackSidebar;
        }
        if (context && context.region && context.region.layout && context.region.layout.isCompact) {
            return MUSIC_LAYOUT_SPECS.trackSidebar;
        }
        return MUSIC_LAYOUT_SPECS.dualRing;
    }

    function drawProgressBar(context, x, y, width, height, ratio) {
        var ctx = context.ctx;
        var palette = context.palette;
        var safeWidth = Math.max(0, width);
        var barHeight = Math.max(2, height || 6);
        var safeRatio = common.clamp(number(ratio, 0), 0, 1);

        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = palette.secondary;
        ctx.fillRect(x, y, safeWidth, barHeight);
        ctx.globalAlpha = 1;
        ctx.fillStyle = palette.primary;
        ctx.fillRect(x, y, safeWidth * safeRatio, barHeight);
        ctx.restore();
    }

    function renderMusic(context, spec) {
        var activeSpec = resolveLayoutSpec(context, spec);
        var media = typeof context.view.getMediaInfo === 'function'
            ? context.view.getMediaInfo()
            : {};
        var palette = context.palette;
        var region = context.region;
        var hasMedia = media && media.has_media === true;
        var padX = activeSpec.padX;
        var coverSize = activeSpec.coverSize;
        var coverX = region.x + padX;
        var coverY = region.y + activeSpec.coverOffsetY;
        var textX = coverX + coverSize + activeSpec.textOffsetX;
        var textRight = region.x + region.width - padX;
        var title = hasMedia ? truncate(media.title, activeSpec.maxTitleLength) : 'NO ACTIVE MEDIA';
        var artist = hasMedia ? truncate(media.artist, activeSpec.maxArtistLength) : 'SYSTEM MEDIA SESSION NOT FOUND';
        var album = hasMedia ? truncate(media.album_title, activeSpec.maxAlbumLength) : 'Metadata unavailable';
        var position = formatTime(media && media.position_seconds);
        var duration = formatTime(number(media && media.start_seconds, 0) + number(media && media.duration_seconds, -1));
        var progressY = region.y + region.height - activeSpec.progressOffsetY;
        var progressWidth = region.width - padX * 2;
        var timeY = progressY + activeSpec.timeOffsetY;

        if (!context.ctx || !common) return;

        drawCover(context, hasMedia ? media : {}, coverX, coverY, coverSize);
        setText(context, title, textX, coverY + activeSpec.titleOffsetY, 'dualRingCenterValue', hasMedia ? palette.text : palette.secondary, activeSpec.titleSize, 'left');
        setText(context, artist, textX, coverY + activeSpec.artistOffsetY, 'dualRingCenterSubtitle', palette.secondary, activeSpec.artistSize, 'left');
        setText(context, album, textX, coverY + activeSpec.albumOffsetY, 'dualRingCenterSubtitle', palette.secondary, activeSpec.albumSize, 'left');
        // The status is intentionally a symbol-only hint; verbose status and
        // playback type remain available in the contract but are not rendered.
        setText(context, statusSymbol(media), textRight, region.y + activeSpec.symbolOffsetY, 'dualRingCenterSubtitle', palette.primary, activeSpec.symbolSize, 'right');
        drawProgressBar(context, coverX, progressY, progressWidth, activeSpec.progressHeight, progressRatio(media));
        setText(context, position + ' / ' + duration, region.x + region.width / 2, timeY, 'captionLegal', palette.secondary, activeSpec.timeSize, 'center');
    }

    window.S650HmiCenterInfoMusicContracts = MUSIC_LAYOUT_SPECS;

    window.S650HmiCenterInfo.register({
        id: 'music',
        label: 'Music player',
        status: 'production',
        render: function (context) {
            renderMusic(context, MUSIC_LAYOUT_SPECS.dualRing);
        },
        renderCompact: function (context) {
            renderMusic(context, MUSIC_LAYOUT_SPECS.trackSidebar);
        }
    });
})(window);
