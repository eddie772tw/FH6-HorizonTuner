// =============================================================================
// shared/overlay-forwarding.js
// Coalesces host-to-iframe audio messages to one delivery per event-loop turn.
// =============================================================================

export function createOverlayEventForwarder(postToHud, schedule = setTimeout) {
    let pendingAudio = null;
    let audioFlushScheduled = false;

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
            pendingAudio = data;
            if (!audioFlushScheduled) {
                audioFlushScheduled = true;
                schedule(flushAudio, 0);
            }
        },
        onMedia(data) {
            postToHud('hud:media', { data });
        },
        flushAudio,
    };
}
