/* A bounded, read-only view of already validated media metadata. */
(function (root) {
    'use strict';
    function formatTime(value) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 360000) return '—:—';
        const seconds = Math.floor(value), hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds / 60) % 60;
        return hours ? hours + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
            : minutes + ':' + String(seconds % 60).padStart(2, '0');
    }
    function create(document) {
        const nodes = {};
        ['Art', 'ArtFallback', 'Title', 'Artist', 'Album', 'Progress', 'Position', 'Duration', 'Status'].forEach(name => { nodes[name] = document.getElementById('lfaMedia' + name); });
        let artKey = '', generation = 0, pending = null, destroyed = false;
        function text(name, value) { if (nodes[name].textContent !== value) nodes[name].textContent = value; }
        function clearArt() {
            generation++;
            if (pending) { pending.onload = pending.onerror = null; pending = null; }
            nodes.Art.onerror = null;
            nodes.Art.hidden = true; nodes.ArtFallback.hidden = false;
            nodes.Art.removeAttribute('src');
        }
        function artwork(media) {
            const key = JSON.stringify([media.title, media.artist, media.album, media.artUrl]);
            if (key === artKey) return;
            artKey = key; clearArt();
            if (!media.artUrl || typeof root.Image !== 'function') return;
            const token = generation, candidate = new root.Image(); pending = candidate;
            candidate.onload = () => {
                if (destroyed || token !== generation || candidate !== pending) return;
                pending = null;
                if (!(candidate.naturalWidth > 0 && candidate.naturalHeight > 0)) return;
                nodes.Art.onerror = () => { if (!destroyed && token === generation) { nodes.Art.hidden = true; nodes.ArtFallback.hidden = false; } };
                nodes.Art.src = media.artUrl; nodes.Art.hidden = false; nodes.ArtFallback.hidden = true;
            };
            candidate.onerror = () => { if (!destroyed && token === generation && candidate === pending) pending = null; };
            candidate.src = media.artUrl;
        }
        function render(media, visible) {
            if (destroyed) return;
            if (!visible || !media?.available) { if (artKey) { artKey = ''; clearArt(); } return; }
            text('Title', media.title || 'No title'); text('Artist', media.artist || '—'); text('Album', media.album || '—');
            const status = ['playing', 'paused', 'stopped', 'opened', 'changing'].includes(media.status) ? media.status.toUpperCase() : 'MEDIA';
            text('Status', media.freshness === 'stale' ? 'STALE / ' + status : status);
            nodes.Status.dataset.stale = String(media.freshness === 'stale');
            text('Position', formatTime(media.position)); text('Duration', formatTime(media.duration));
            const fraction = typeof media.progress === 'number' && Number.isFinite(media.progress) ? Math.max(0, Math.min(1, media.progress)) : null;
            nodes.Progress.style.strokeDasharray = (fraction ?? 0) * 100 + ' 100';
            nodes.Progress.style.visibility = fraction === null ? 'hidden' : '';
            artwork(media);
        }
        function destroy() { if (destroyed) return; destroyed = true; artKey = ''; clearArt(); }
        return { render, destroy };
    }
    root.LfaMediaRenderer = { create, formatTime };
})(typeof window === 'undefined' ? globalThis : window);
