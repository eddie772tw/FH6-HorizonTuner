// =============================================================================
// shared/utils.js
// Shared display utilities used by all HUDs.
// Call initUtils() once after the DOM is ready.
// =============================================================================

// ── Speed units ───────────────────────────────────────────────────────────────
let _useMetric = localStorage.getItem('forza_hud_speed_unit') !== 'imperial';

export function convertSpeed(ms) {
    return _useMetric ? ms * 3.6 : ms * 2.23694;
}

export function getSpeedUnit() {
    return _useMetric ? 'KM/H' : 'MPH';
}

export function isMetric() {
    return _useMetric;
}

export function setSpeedUnit(metric) {
    _useMetric = metric;
    localStorage.setItem('forza_hud_speed_unit', metric ? 'metric' : 'imperial');
    // Let the active HUD update its own speed unit label
    window.dispatchEvent(new CustomEvent('speedunit:changed', { detail: { metric } }));
}

export function toggleSpeedUnit() {
    setSpeedUnit(!_useMetric);
}

// ── Speed display — wraps each digit in a <span> for tabular spacing ─────────
export function setSpeedDisplay(value) {
    const el = document.getElementById('speedText');
    if (!el) return;
    el.innerHTML = value
        .toString()
        .split('')
        .map(d => `<span>${d}</span>`)
        .join('');
}

// ── Notifications ─────────────────────────────────────────────────────────────
let _notificationsEnabled =
    localStorage.getItem('forza_hud_notifications_enabled') !== 'false';

let _notifTimeout = null;
let _lastNotifTime = 0;

export function showNotification(message, duration = 5000) {
    // tutorialActive is a global set by the tutorial engine — respect it
    if (!_notificationsEnabled || window.tutorialActive) return;

    const bubble = document.getElementById('notification-bubble');
    const text   = document.getElementById('bubble-text');
    if (!bubble || !text) return;

    const now = Date.now();
    if (now - _lastNotifTime < 500) {
        clearTimeout(_notifTimeout);
        _notifTimeout = setTimeout(() => showNotification(message, duration), 600);
        return;
    }
    _lastNotifTime = now;
    text.textContent = message;
    bubble.classList.add('show');
    clearTimeout(_notifTimeout);
    _notifTimeout = setTimeout(() => bubble.classList.remove('show'), duration);
}

export function toggleNotifications() {
    _notificationsEnabled = !_notificationsEnabled;
    localStorage.setItem('forza_hud_notifications_enabled', _notificationsEnabled);

    // Update any status spans in the settings panel
    document.querySelectorAll('.notif-status-text').forEach(el => {
        el.textContent = _notificationsEnabled ? 'ON' : 'OFF';
    });

    // Briefly force-enable to show the confirmation, then restore
    const prev = _notificationsEnabled;
    _notificationsEnabled = true;
    showNotification(prev ? '🔔 Notifications enabled' : '🔕 Notifications disabled');
    _notificationsEnabled = prev;
}

export function notificationsEnabled() {
    return _notificationsEnabled;
}

// ── HUD scale — keeps the HUD proportional to the window size ─────────────────
export function updateScale() {
    const scaleX = window.innerWidth  / 750;
    const scaleY = window.innerHeight / 900;
    const scale  = Math.min(scaleX, scaleY, 1);
    document.documentElement.style.setProperty('--hud-scale', scale);
}

// ── Init — wire up DOM-dependent handlers ─────────────────────────────────────
export function initUtils() {
    // Scale
    updateScale();
    window.addEventListener('resize', updateScale);

    // Notification bubble close button
    document.getElementById('bubble-close')
        ?.addEventListener('click', () => {
            document.getElementById('notification-bubble')?.classList.remove('show');
            clearTimeout(_notifTimeout);
        });

    // Apply saved speed unit to the speed unit label on load
    const unitEl = document.getElementById('speedUnit');
    if (unitEl) unitEl.textContent = getSpeedUnit();

    // Keep unit label in sync when unit changes
    window.addEventListener('speedunit:changed', (e) => {
        const unitEl = document.getElementById('speedUnit');
        if (unitEl) unitEl.textContent = e.detail.metric ? 'KM/H' : 'MPH';
    });
}

// ── Expose on window for non-module script blocks ─────────────────────────────
window.showNotification   = showNotification;
window.toggleNotifications = toggleNotifications;
window.convertSpeed       = convertSpeed;
window.setSpeedDisplay    = setSpeedDisplay;
window.toggleSpeedUnit    = toggleSpeedUnit;
window.getSpeedUnit       = getSpeedUnit;
