// =============================================================================
// shared/overlay-dedupe.js
// Drops unchanged overlay snapshots before they reach a HUD renderer.
// =============================================================================

const EMPTY_SPECTRUM = Object.freeze(Array(32).fill(0));

function getSequence(value) {
    const sequence = Number(value?.sequence);
    return Number.isFinite(sequence) ? sequence : null;
}

function mediaFingerprint(value) {
    return JSON.stringify([
        value?.title ?? '',
        value?.artist ?? '',
        value?.album_title ?? '',
        value?.album_artist ?? '',
        value?.subtitle ?? '',
        value?.genres ?? [],
        value?.track_number ?? null,
        value?.album_track_count ?? null,
        value?.playback_type ?? '',
        Boolean(value?.thumbnail_available),
        value?.thumbnail_url ?? '',
        value?.status ?? '',
        value?.position_seconds ?? null,
        value?.start_seconds ?? null,
        value?.duration_seconds ?? null,
        value?.min_seek_seconds ?? null,
        value?.max_seek_seconds ?? null,
        value?.timeline_last_updated_ms ?? null,
        Boolean(value?.can_seek),
        Boolean(value?.is_shuffle_active),
        value?.repeat_mode ?? '',
        value?.playback_rate ?? 1,
        value?.playback_controls ?? {},
        value?.source_app_user_model_id ?? '',
        value?.state ?? '',
        value?.source ?? '',
        Boolean(value?.has_media),
    ]);
}

export function createOverlayEventDedupe(dispatch) {
    let lastAudioSequence = null;
    let lastAudioState = null;
    let lastMediaFingerprint = null;

    function onAudio(data) {
        const sequence = getSequence(data);
        const state = data?.state ?? null;

        if (sequence !== null && sequence === lastAudioSequence && state === lastAudioState) {
            return false;
        }

        if (sequence !== null) {
            lastAudioSequence = sequence;
        }
        lastAudioState = state;
        dispatch('hud:audio', data);
        return true;
    }

    function onMedia(data) {
        const fingerprint = mediaFingerprint(data);
        if (fingerprint === lastMediaFingerprint) {
            return false;
        }

        lastMediaFingerprint = fingerprint;
        dispatch('hud:media', data);
        return true;
    }

    return {
        onAudio,
        onMedia,
        onDisconnect() {
            onAudio({
                success: true,
                spectrum: EMPTY_SPECTRUM,
                vu_left: 0,
                vu_right: 0,
                has_audio: false,
                state: 'stale',
                sequence: lastAudioSequence ?? 0,
                captured_at_ms: 0,
                source: 'websocket',
            });
        },
        reset() {
            lastAudioSequence = null;
            lastAudioState = null;
            lastMediaFingerprint = null;
        },
    };
}
