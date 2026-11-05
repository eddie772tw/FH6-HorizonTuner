// =============================================================================
// shared/overlay-forwarding.js
// Coalesces host-to-iframe audio messages to one delivery per event-loop turn.
// =============================================================================

export function createOverlayEventForwarder(postToHud, schedule = setTimeout) {
    let pendingAudio = null;
    let audioFlushScheduled = false;
    let latestAudio = null;
    let latestMedia = null;

    function flushAudio() {
        audioFlushScheduled = false;
        const data = pendingAudio;
        pendingAudio = null;
        if (data !== null) {
            postToHud('hud:audio', { data });
        }
    }

    return {
        onAudio(data) {
            latestAudio = data;
            pendingAudio = data;
            if (!audioFlushScheduled) {
                audioFlushScheduled = true;
                schedule(flushAudio, 0);
            }
        },
        onMedia(data) {
            latestMedia = data;
            postToHud('hud:media', { data });
        },
        replay(post) {
            if (latestAudio !== null) post('hud:audio', { data: latestAudio });
            if (latestMedia !== null) post('hud:media', { data: latestMedia });
        },
        flushAudio,
    };
}
