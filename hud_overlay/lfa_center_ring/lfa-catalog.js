/* One same-origin catalog read per style lifetime; never a per-frame request. */
(function (root) {
    'use strict';
    function create(options) {
        let started = false, destroyed = false, generation = 0, controller = null, timer = null;
        function start() {
            if (started || destroyed || typeof options.fetch !== 'function') return;
            started = true; const token = ++generation;
            controller = new options.AbortController();
            timer = options.setTimeout(() => { generation++; controller?.abort(); }, 4000);
            Promise.resolve(options.fetch('/api/cars/database', { signal: controller.signal, cache: 'no-store' }))
                .then(response => response.ok ? response.json() : null)
                .then(data => { if (!destroyed && token === generation && data && typeof data === 'object' && !Array.isArray(data)) options.onLoad(data); })
                .catch(() => {})
                .finally(() => { if (timer !== null) options.clearTimeout(timer); timer = null; });
        }
        function destroy() { if (destroyed) return; destroyed = true; generation++; if (timer !== null) options.clearTimeout(timer); controller?.abort(); }
        return { start, destroy };
    }
    root.LfaCatalog = { create };
})(typeof window === 'undefined' ? globalThis : window);
