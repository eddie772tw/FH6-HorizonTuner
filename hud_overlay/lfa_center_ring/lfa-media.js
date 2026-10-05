/* LFA-owned read-only media health. No transport changes or playback commands. */
(function (root) {
    'use strict';
    const POLL_MS = 1000, STALE_MS = 3000, TIMEOUT_MS = 1500, UNSUPPORTED_MS = 30000;
    const ENDPOINT = '/api/overlay/system_media', CAPABILITIES = '/api/runtime';
    const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
    const text = value => typeof value === 'string' ? value.trim() : '';
    const statuses = new Set(['playing', 'paused', 'stopped', 'opened', 'changing']);
    function empty() {
        return { available: false, has_valid_metadata: false, freshness: 'unavailable',
            title: '', artist: '', album: '', status: 'none', position: null, duration: null, progress: null, artUrl: null };
    }
    function normalize(snapshot) {
        if (!snapshot || typeof snapshot !== 'object' || snapshot.has_media !== true || snapshot.success !== true) return empty();
        const title = text(snapshot.title), artist = text(snapshot.artist), album = text(snapshot.album_title);
        // Only the existing same-origin provider route is eligible; never load URLs supplied by a player.
        const artUrl = snapshot.thumbnail_available === true && typeof snapshot.thumbnail_url === 'string'
            && /^\/api\/overlay\/media\/thumbnail\?v=[a-zA-Z0-9_-]{1,128}$/.test(snapshot.thumbnail_url) ? snapshot.thumbnail_url : null;
        const has_valid_metadata = Boolean(title || artist || album || artUrl);
        const status = statuses.has(snapshot.status) ? snapshot.status : 'none';
        const live = snapshot.state === 'live' && snapshot.source === 'winrt';
        const stale = snapshot.state === 'stale' && ['winrt', 'stale'].includes(snapshot.source);
        if (!has_valid_metadata || status === 'none' || (!live && !stale)) return empty();
        const duration = finite(snapshot.duration_seconds) ? snapshot.duration_seconds : null;
        const elapsed = finite(snapshot.position_seconds) && finite(snapshot.start_seconds)
            ? snapshot.position_seconds - snapshot.start_seconds : null;
        const position = elapsed;
        const progress = position !== null && duration > 0 ? Math.max(0, Math.min(1, position / duration)) : null;
        return { available: live, has_valid_metadata, freshness: live ? 'live' : 'stale',
            title, artist, album, status, position, duration, progress, artUrl };
    }
    function create(options = {}) {
        const fetchSnapshot = options.fetch || (root.fetch && root.fetch.bind(root));
        const now = options.now || (() => root.performance?.now() ?? Date.now());
        const schedule = options.setTimeout || root.setTimeout.bind(root);
        const cancel = options.clearTimeout || root.clearTimeout.bind(root);
        const Controller = options.AbortController || root.AbortController;
        let enabled = false, destroyed = false, generation = 0, eventRevision = 0;
        let capabilityPending = true, unsupported = false;
        let current = empty(), confirmedAt = null, lastHealthAt = null, retryAt = 0, lastNow = 0;
        let wake = null, inFlight = null;
        // Consecutive duplicate events are not health confirmations. A GET can reconfirm unchanged media.
        // Ordered events may legitimately return to an earlier track; no provider sequence is assumed.
        let lastSnapshotKey = null;
        function time(value = now()) { if (finite(value)) lastNow = Math.max(lastNow, value); return lastNow; }
        function emit() { if (typeof options.onChange === 'function') options.onChange({ ...current }); }
        function expire(at) {
            if (confirmedAt !== null && at - confirmedAt >= STALE_MS) {
                current = empty(); confirmedAt = null; emit();
            }
        }
        function view(at) { expire(time(at)); return { ...current }; }
        function clearWake() { if (wake !== null) cancel(wake); wake = null; }
        function dueAt(at) { return Math.max(retryAt, lastHealthAt === null ? at : lastHealthAt + POLL_MS); }
        function plan() {
            clearWake();
            if (!enabled || destroyed) return;
            const at = time();
            let due = inFlight || unsupported ? Infinity : dueAt(at);
            if (confirmedAt !== null) due = Math.min(due, confirmedAt + STALE_MS);
            if (Number.isFinite(due)) wake = schedule(tick, Math.max(0, due - at));
        }
        function failed() {
            expire(time());
            if (current.available) { current = { ...current, freshness: 'stale' }; emit(); }
        }
        function apply(snapshot, at) {
            const next = normalize(snapshot);
            if (next.available) {
                current = next; confirmedAt = lastHealthAt = at; retryAt = 0;
                lastSnapshotKey = JSON.stringify(next); emit();
            } else failed(); // Missing, malformed and explicitly stale data cannot extend the last live deadline.
        }
        function accept(snapshot) {
            if (!enabled || destroyed) return;
            const normalized = normalize(snapshot), key = JSON.stringify(normalized);
            if (normalized.available && key === lastSnapshotKey) return;
            eventRevision++;
            if (normalized.available) { unsupported = false; capabilityPending = false; }
            apply(snapshot, time());
            plan();
        }
        async function poll() {
            if (!enabled || destroyed || inFlight || typeof fetchSnapshot !== 'function' || typeof Controller !== 'function') return;
            const request = { generation, revision: eventRevision, capability: capabilityPending, controller: new Controller(), timedOut: false, timer: null };
            capabilityPending = false;
            inFlight = request;
            const valid = () => enabled && !destroyed && request.generation === generation && request.revision === eventRevision && !request.timedOut;
            request.timer = schedule(() => {
                request.timedOut = true;
                request.controller.abort();
                if (enabled && !destroyed && request.generation === generation && request.revision === eventRevision) failed();
                plan();
            }, TIMEOUT_MS);
            try {
                const response = await fetchSnapshot(request.capability ? CAPABILITIES : ENDPOINT, { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: request.controller.signal });
                if (!valid()) return;
                if (!response || response.ok !== true) {
                    if (!request.capability && [404, 405, 501].includes(response?.status)) retryAt = time() + UNSUPPORTED_MS;
                    failed(); return;
                }
                const snapshot = await response.json();
                if (valid()) {
                    if (request.capability) unsupported = snapshot?.capabilities?.systemMedia === false;
                    else apply(snapshot, time());
                }
            } catch (_) {
                if (valid()) failed();
            } finally {
                cancel(request.timer);
                if (inFlight === request) inFlight = null;
                if (enabled && !destroyed) {
                    // Event delivery during a request owns the next health deadline.
                    if (request.generation === generation && request.revision === eventRevision) {
                        retryAt = Math.max(retryAt, time() + (request.capability ? 0 : POLL_MS));
                    }
                    plan();
                }
            }
        }
        function tick() {
            wake = null;
            if (!enabled || destroyed) return;
            const at = time(); expire(at);
            if (!inFlight && !unsupported && at >= dueAt(at)) {
                if (typeof fetchSnapshot !== 'function' || typeof Controller !== 'function') retryAt = at + UNSUPPORTED_MS;
                else poll();
            }
            plan();
        }
        function start() {
            if (enabled || destroyed) return;
            enabled = true; generation++; retryAt = 0; lastHealthAt = null;
            capabilityPending = true; unsupported = false;
            tick();
        }
        function stop() {
            if (!enabled) return;
            enabled = false; generation++; eventRevision++; clearWake();
            if (inFlight) { inFlight.timedOut = true; cancel(inFlight.timer); inFlight.controller.abort(); }
            current = empty(); confirmedAt = lastHealthAt = null; emit();
        }
        function setEnabled(value) { if (value === true) start(); else stop(); }
        function destroy() { if (destroyed) return; stop(); destroyed = true; }
        return { start, stop, setEnabled, accept, view, destroy };
    }
    const api = { POLL_MS, STALE_MS, TIMEOUT_MS, UNSUPPORTED_MS, normalize, create };
    root.LfaMedia = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
