// =============================================================================
// shared/coordinator.js
// Single source of truth for all telemetry processing.
// Receives raw telemetry from ws.js, runs it through every shared module,
// computes session maxima and lockup deltas, then dispatches one clean
// 'hud:frame' event the active HUD renders from.
//
// Usage (in src/index.html only):
//   import { initCoordinator } from './shared/coordinator.js';
//   initCoordinator();
//
// HUDs listen to:
//   window.addEventListener('hud:frame', (e) => {
//       const { data, redlineRpm, lcState, sessionMaxima, lockup } = e.detail;
//   });
// =============================================================================

import { updatePhysicsTargets }  from './physics.js';

// ── Init ──────────────────────────────────────────────────────────────────────
export function initCoordinator() {
    window.addEventListener('telemetry', _onTelemetry);

    // Periodic memory cleanup
    setInterval(() => {
        performance.clearResourceTimings();
        performance.clearMarks();
        performance.clearMeasures();
    }, 30_000);

    console.log('[Coordinator] Initialized');
}

// ── Core pipeline ─────────────────────────────────────────────────────────────
let _lastLcState  = 'inactive';
let _lastCarKey   = '';

function _onTelemetry(e) {
    const data = e.detail;
    window._diag?.countWsMessage?.();

    updatePhysicsTargets(data);

    // Notification from Rust
    if (data.notification) {
        window.showNotification?.(data.notification);
    }

    // Car changed event
    if (data.carChanged) {
        window.dispatchEvent(new CustomEvent('car:changed', {
            detail: {
                carOrdinal: data.carOrdinal,
                carKey:     data.carKey,
                isKnown:    data.isKnown,
                redline:    data.redlineRpm,
                maxRpm:     data.maxRpm,
                idleRpm:    data.idleRpm,
            }
        }));
    }

    // Car learned event
    if (data.carLearned) {
        window.dispatchEvent(new CustomEvent('car:learned', {
            detail: {
                carOrdinal: data.carOrdinal,
                carKey:     data.carKey,
                redline:    data.redlineRpm,
            }
        }));
    }

    // LC state change
    if (data.lcState !== _lastLcState) {
        _lastLcState = data.lcState;
        window.dispatchEvent(new CustomEvent('lc:state', {
            detail: {
                armed:    data.lcState === 'armed',
                launched: data.lcState === 'launched',
            }
        }));
    }

    window.dispatchEvent(new CustomEvent('hud:frame', {
        detail: {
            data,
            redlineRpm:    data.redlineRpm,
            lcState:       data.lcState,
            sessionMaxima: data.sessionMaxima,
            lockup:        data.lockup,
        }
    }));

    window._diag?.countFrame?.();
}