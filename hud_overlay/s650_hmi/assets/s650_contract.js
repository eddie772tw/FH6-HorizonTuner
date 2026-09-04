/*
 * S650 HMI data and layout contract.
 *
 * This file is intentionally dependency-free and is loaded before the
 * renderer modules. It defines the only telemetry/config shape that the
 * S650 Canvas renderer is allowed to consume.
 */
(function (window) {
    'use strict';

    var THEMES = [
        'normal',
        'heritage67',
        'foxbody',
        'track'
    ];

    var CENTER_WIDGETS = [
        'disable',
        'drive',
        'tire_temp',
        'performance',
        'music'
    ];

    // Complete bounded projection of GSMTC media-properties and the related
    // playback/timeline state. The current renderer only consumes textual
    // metadata and timeline progress; the remaining fields are deliberately
    // declared here so future integrations have a stable entry point.
    var DEFAULT_PLAYBACK_CONTROLS = {
        is_channel_down_enabled: false,
        is_channel_up_enabled: false,
        is_fast_forward_enabled: false,
        is_next_enabled: false,
        is_pause_enabled: false,
        is_playback_position_enabled: false,
        is_playback_rate_enabled: false,
        is_play_enabled: false,
        is_play_pause_toggle_enabled: false,
        is_previous_enabled: false,
        is_record_enabled: false,
        is_repeat_enabled: false,
        is_rewind_enabled: false,
        is_shuffle_enabled: false,
        is_stop_enabled: false
    };

    // Contract-only names for future deep integration. These are intentionally
    // declarations, not active listeners or commands.
    var RESERVED_GSMTC_INTEGRATION = Object.freeze({
        events: Object.freeze([
            'CurrentSessionChanged',
            'MediaPropertiesChanged',
            'PlaybackInfoChanged',
            'TimelinePropertiesChanged'
        ]),
        methods: Object.freeze([
            'TryPlayAsync',
            'TryPauseAsync',
            'TryTogglePlayPauseAsync',
            'TrySkipNextAsync',
            'TrySkipPreviousAsync',
            'TryChangePlaybackPositionAsync',
            'TryChangePlaybackRateAsync',
            'TryChangeShuffleActiveAsync',
            'TryChangeAutoRepeatModeAsync',
            'TryStopAsync',
            'TryFastForwardAsync',
            'TryRewindAsync'
        ])
    });

    var DEFAULT_MEDIA = {
        title: null,
        artist: null,
        album_title: null,
        album_artist: null, // Reserved: not yet rendered separately from artist.
        album_track_count: null,
        track_number: null,
        genres: [],
        playback_type: null,
        subtitle: null, // Reserved: player-dependent version/subtitle metadata.
        thumbnail: null, // Reserved: WinRT RandomAccessStream is not serialized.
        thumbnail_url: null, // HTTP endpoint path for bounded image bytes.
        thumbnail_available: false, // Reserved: image transport/cache is not defined.
        status: 'none',
        position_seconds: null,
        start_seconds: null,
        duration_seconds: null,
        min_seek_seconds: null, // Reserved: future seek UI must honor this bound.
        max_seek_seconds: null, // Reserved: future seek UI must honor this bound.
        timeline_last_updated_ms: null, // Reserved: event/timeline freshness diagnostics.
        can_seek: false, // Reserved: no seek command is exposed by this read-only page.
        is_shuffle_active: false,
        repeat_mode: 'none',
        playback_rate: 1,
        // Reserved for future transport controls; the widget is read-only.
        playback_controls: Object.assign({}, DEFAULT_PLAYBACK_CONTROLS),
        // Reserved for app/session routing and diagnostics, not shown in HMI.
        source_app_user_model_id: null,
        has_media: false,
        state: 'none',
        source: 'none',
        success: true
    };

    // Code-only assignment for Heritage dual-ring telemetry slots. This is
    // intentionally separate from user-facing HMI configuration.
    var HERITAGE_TELEMETRY_SLOTS = Object.freeze({
        center: Object.freeze({
            topLeft: 'odometer',
            topRight: 'heading',
            bottomLeft: 'rpm',
            bottomRight: 'speed'
        }),
        side: Object.freeze({
            left: 'power',
            right: 'boost'
        })
    });

    var CANVAS = {
        width: 1280,
        height: 480,
        safeZone: {
            top: 40,
            left: 48,
            right: 48,
            bottom: 40
        },
        gauge: {
            leftCenterX: 256,
            rightCenterX: 1024,
            centerY: 250,
            radius: 180,
            speedScaleMax: 360
        },
        regions: {
            header: { x: 0, y: 0, width: 1280, height: 64 },
            left: { x: 48, y: 64, width: 352, height: 360 },
            center: { x: 400, y: 64, width: 480, height: 360 },
            right: { x: 880, y: 64, width: 352, height: 360 },
            footer: { x: 48, y: 424, width: 1184, height: 56 },
            telltales: { x: 48, y: 424, width: 360, height: 56 }
        }
    };

    var EMPTY_TIRE_TEMPERATURES = Object.freeze([null, null, null, null]);

    // This is deliberately a closed shape. The coordinator is the only
    // upstream owner that converts raw Forza telemetry into these fixed-unit
    // values; the renderer must never infer aliases or source units.
    var DEFAULT_FRAME = {
        rpm: 0,
        maxRpm: 8000,
        redlineRpm: 7000,
        speed_kmh: 0,
        speed_mph: 0,
        gear: 1,
        throttle: 0,
        brake: 0,
        distance_m: 0,
        heading_deg: 0,
        tire_temp_f: EMPTY_TIRE_TEMPERATURES,
        power_hp: 0,
        power_kw: 0,
        power_ps: 0,
        power: 0,
        power_unit: 'HP',
        torque_nm: 0,
        torque_ftlbs: 0,
        boost_psi: 0,
        boost_bar: 0,
        boost_kpa: 0,
        boost: 0,
        boost_unit: 'PSI',
        displayUnits: {},
        fuel_ratio: null,
        lap: null,
        race_position: null
    };

    function isObject(value) {
        return value !== null && typeof value === 'object';
    }

    function finiteNumber(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function firstDefined() {
        for (var i = 0; i < arguments.length; i += 1) {
            if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i];
        }
        return undefined;
    }

    function normalizeTheme(theme) {
        return THEMES.indexOf(theme) >= 0 ? theme : 'heritage67';
    }

    function normalizeCenterWidget(widget) {
        return CENTER_WIDGETS.indexOf(widget) >= 0 ? widget : 'drive';
    }

    function normalizeMedia(data) {
        var source = isObject(data) ? data : {};
        var genres = Array.isArray(source.genres)
            ? source.genres.filter(function (genre) { return typeof genre === 'string'; }).slice(0, 8)
            : [];
        var numericFields = [
            'album_track_count',
            'track_number',
            'position_seconds',
            'start_seconds',
            'duration_seconds',
            'min_seek_seconds',
            'max_seek_seconds',
            'timeline_last_updated_ms',
            'playback_rate'
        ];
        var normalized = Object.assign({}, DEFAULT_MEDIA, {
            genres: genres,
            playback_controls: Object.assign(
                {},
                DEFAULT_PLAYBACK_CONTROLS,
                isObject(source.playback_controls) ? source.playback_controls : {}
            ),
            has_media: source.has_media === true,
            can_seek: source.can_seek === true,
            is_shuffle_active: source.is_shuffle_active === true
        });
        ['title', 'artist', 'album_title', 'album_artist', 'subtitle', 'playback_type', 'status', 'repeat_mode', 'source', 'source_app_user_model_id'].forEach(function (key) {
            if (typeof source[key] === 'string') normalized[key] = source[key];
        });
        normalized.thumbnail = source.thumbnail === null || source.thumbnail === undefined ? null : source.thumbnail;
        normalized.thumbnail_url = typeof source.thumbnail_url === 'string' && source.thumbnail_url.trim() ? source.thumbnail_url.trim() : null;
        normalized.thumbnail_available = source.thumbnail_available === true || Boolean(normalized.thumbnail_url);
        numericFields.forEach(function (key) {
            if (source[key] === null || source[key] === undefined || source[key] === '') {
                normalized[key] = null;
                return;
            }
            var value = Number(source[key]);
            normalized[key] = Number.isFinite(value) ? value : null;
        });
        normalized.success = source.success !== false;
        return normalized;
    }

    function readValue(payload, key) {
        if (!isObject(payload)) return undefined;
        if (payload[key] !== undefined) return payload[key];
        if (isObject(payload.data) && payload.data[key] !== undefined) return payload.data[key];
        return undefined;
    }

    function readElements(payload) {
        var elements = readValue(payload, 'elements');
        return isObject(elements) ? elements : {};
    }

    function normalizeConfig(payload) {
        var rawTheme = firstDefined(readValue(payload, 's650Theme'), readValue(payload, 'clusterTheme'));
        var rawMetric = firstDefined(readValue(payload, 'isMetric'), readValue(payload, 'metric'));
        var unit = readValue(payload, 'unit');

        var isMetric = rawMetric === undefined
            ? unit !== 'mph' && unit !== 'imperial'
            : rawMetric !== false;

        return {
            contractVersion: 's650-hmi/v2',
            theme: normalizeTheme(rawTheme),
            centerWidget: normalizeCenterWidget(firstDefined(readValue(payload, 's650CenterWidget'), readValue(payload, 'centerWidget'))),
            guiThemeMode: readValue(payload, 's650GuiThemeMode') === 'light' ? 'light' : 'dark',
            isMetric: isMetric,
            elements: readElements(payload)
        };
    }

    function nullableNumber(value) {
        if (value === undefined || value === null || value === '') return null;
        var number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function normalizeTireTemperatures(source) {
        return Array.isArray(source.tire_temp_f)
            ? source.tire_temp_f
            : EMPTY_TIRE_TEMPERATURES;
    }

    function normalizeFrame(data) {
        var source = isObject(data) ? data : {};
        var maxRpm = Math.max(1, finiteNumber(source.maxRpm, DEFAULT_FRAME.maxRpm));
        var rpm = Math.max(0, finiteNumber(source.rpm, DEFAULT_FRAME.rpm));
        var redline = clamp(
            finiteNumber(source.redlineRpm, maxRpm - 1000),
            1,
            maxRpm
        );
        var heading = finiteNumber(source.heading_deg, DEFAULT_FRAME.heading_deg);
        var fuelRatio = nullableNumber(source.fuel_ratio);

        return {
            rpm: rpm,
            maxRpm: maxRpm,
            redlineRpm: redline,
            speed_kmh: Math.max(0, finiteNumber(source.speed_kmh, DEFAULT_FRAME.speed_kmh)),
            speed_mph: Math.max(0, finiteNumber(source.speed_mph, DEFAULT_FRAME.speed_mph)),
            gear: finiteNumber(source.gear, DEFAULT_FRAME.gear),
            throttle: clamp(finiteNumber(source.throttle, DEFAULT_FRAME.throttle), 0, 1),
            brake: clamp(finiteNumber(source.brake, DEFAULT_FRAME.brake), 0, 1),
            distance_m: Math.max(0, finiteNumber(source.distance_m, DEFAULT_FRAME.distance_m)),
            heading_deg: ((heading % 360) + 360) % 360,
            tire_temp_f: normalizeTireTemperatures(source),
            power_hp: Math.max(0, finiteNumber(source.power_hp, DEFAULT_FRAME.power_hp)),
            power_kw: Math.max(0, finiteNumber(source.power_kw, DEFAULT_FRAME.power_kw)),
            power_ps: Math.max(0, finiteNumber(source.power_ps, DEFAULT_FRAME.power_ps)),
            power: source.power === undefined
                ? Math.max(0, finiteNumber(source.power_hp, DEFAULT_FRAME.power))
                : Math.max(0, finiteNumber(source.power, DEFAULT_FRAME.power)),
            power_unit: typeof source.power_unit === 'string' ? source.power_unit : DEFAULT_FRAME.power_unit,
            torque_nm: finiteNumber(source.torque_nm, DEFAULT_FRAME.torque_nm),
            torque_ftlbs: finiteNumber(source.torque_ftlbs, DEFAULT_FRAME.torque_ftlbs),
            boost_psi: Math.max(0, finiteNumber(source.boost_psi, DEFAULT_FRAME.boost_psi)),
            boost_bar: Math.max(0, finiteNumber(source.boost_bar, DEFAULT_FRAME.boost_bar)),
            boost_kpa: Math.max(0, finiteNumber(source.boost_kpa, DEFAULT_FRAME.boost_kpa)),
            boost: source.boost === undefined
                ? Math.max(0, finiteNumber(source.boost_psi, DEFAULT_FRAME.boost))
                : Math.max(0, finiteNumber(source.boost, DEFAULT_FRAME.boost)),
            boost_unit: typeof source.boost_unit === 'string' ? source.boost_unit : DEFAULT_FRAME.boost_unit,
            displayUnits: isObject(source.displayUnits) ? source.displayUnits : DEFAULT_FRAME.displayUnits,
            fuel_ratio: fuelRatio === null ? null : clamp(fuelRatio, 0, 1),
            lap: nullableNumber(source.lap),
            race_position: nullableNumber(source.race_position)
        };
    }

    window.S650HmiContract = {
        version: 's650-hmi/v2',
        themes: Object.freeze(THEMES.slice()),
        centerWidgets: Object.freeze(CENTER_WIDGETS.slice()),
        heritageTelemetrySlots: HERITAGE_TELEMETRY_SLOTS,
        canvas: CANVAS,
        defaultFrame: Object.freeze(Object.assign({}, DEFAULT_FRAME)),
        clamp: clamp,
        finiteNumber: finiteNumber,
        normalizeTheme: normalizeTheme,
        normalizeCenterWidget: normalizeCenterWidget,
        defaultMedia: Object.freeze(Object.assign({}, DEFAULT_MEDIA)),
        reservedGsmTcIntegration: RESERVED_GSMTC_INTEGRATION,
        normalizeMedia: normalizeMedia,
        normalizeConfig: normalizeConfig,
        normalizeFrame: normalizeFrame
    };
})(window);
