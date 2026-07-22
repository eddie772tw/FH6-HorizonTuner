// =============================================================================
// shared/physics.js
// Spring-damper physics system that moves the HUD container in response to
// g-forces from the telemetry stream, creating a sense of physical weight.
//
// Usage:
//   import { initPhysics, updatePhysicsTargets, togglePhysics } from '../shared/physics.js';
//   initPhysics();   // call once after .hud-container is in the DOM
//
//   window.addEventListener('telemetry', (e) => {
//       updatePhysicsTargets(e.detail);
//   });
// =============================================================================

// ── Preference ────────────────────────────────────────────────────────────────
let _physicsEnabled =
    localStorage.getItem('forza_hud_physics_enabled') !== 'false';

// ── Spring state ──────────────────────────────────────────────────────────────
// Axes:
//   x       → translateX  : horizontal bias from braking/acceleration diagonal
//   yBias   → translateY  : vertical bias from braking/acceleration diagonal
//   yWiggle → translateY  : vertical bounce from jumps and suspension (centered)
//   z       → translateZ  : depth push/pull from braking and acceleration
//   roll    → rotateZ     : lateral lean (set scale to 0 to disable)
// const _springs = {
//     x:       { pos: 0, vel: 0, stiffness: 130, damping: 15  },  // was 15
//     yBias:   { pos: 0, vel: 0, stiffness: 130, damping: 15  },  // was 15
//     yWiggle: { pos: 0, vel: 0, stiffness: 170, damping: 16  },  // was 16
//     z:       { pos: 0, vel: 0, stiffness: 120, damping: 14  },  // was 14
//     roll:    { pos: 0, vel: 0, stiffness: 180, damping: 20 },
// };

const _springs = {
    x:       { pos: 0, vel: 0, stiffness: 600, damping: 15 },
    yBias:   { pos: 0, vel: 0, stiffness: 600, damping: 15 },
    yWiggle: { pos: 0, vel: 0, stiffness: 680, damping: 16 },
    z:       { pos: 0, vel: 0, stiffness: 560, damping: 14 },
    roll:    { pos: 0, vel: 0, stiffness: 360, damping: 20 },
};

// ── Input scaling ─────────────────────────────────────────────────────────────
// How strongly raw telemetry values (m/s²) map into visual units.
// Tune these if the effect feels too strong or too subtle.
const PHYSICS_SCALE = {
    y:    1.3,    // m/s²  →  px   vertical wiggle (jumps, suspension)
    z:    1.2,    // m/s²  →  px   depth (braking pulls forward, accel pushes away)
    roll: 0.0,    // m/s²  →  deg  lateral lean (0 = disabled until further tuning)
};

// Diagonal coupling — how much of the Z force bleeds into X and yBias.
// This is what makes braking drift top-left and acceleration drift bottom-right.
const DIAGONAL = {
    x:     0.40,
    yBias: 0.30,
};

// Hard clamps — keeps the HUD on screen even during crashes or massive jumps
const PHYSICS_CLAMP = {
    x:       18,
    yBias:   14,
    yWiggle: 26,
    z:       24,
    roll:    3.0,
};

// Live targets — updated every telemetry frame
export let physicsTargets = { x: 0, yBias: 0, yWiggle: 0, z: 0, roll: 0 };

function _clamp(val, limit) {
    return Math.max(-limit, Math.min(limit, val));
}

// ── Target update — called on every telemetry frame ───────────────────────────
export function updatePhysicsTargets(data) {
    if (!_physicsEnabled) return;

    // console.log(
    //     `[Physics targets] ` +
    //     `raw accelY:${(data.accelY ?? 0).toFixed(2)} ` +
    //     `raw accelZ:${(data.accelZ ?? 0).toFixed(2)} ` +
    //     `→ yBias:${physicsTargets.yBias.toFixed(2)} ` +
    //     `yWiggle:${physicsTargets.yWiggle.toFixed(2)} ` +
    //     `yWiggle_vel:${_springs.yWiggle.vel.toFixed(2)} ` +
    //     `yBias_vel:${_springs.yBias.vel.toFixed(2)} `+
    //     `z:${physicsTargets.z.toFixed(2)}`
    // );

    // Longitudinal (accelZ): braking → top-left, acceleration → bottom-right
    const zForce = -data.accelZ * PHYSICS_SCALE.z;
    physicsTargets.z     = _clamp(zForce,                  PHYSICS_CLAMP.z);
    physicsTargets.x     = _clamp(zForce * DIAGONAL.x,     PHYSICS_CLAMP.x);
    physicsTargets.yBias = _clamp(zForce * DIAGONAL.yBias, PHYSICS_CLAMP.yBias);

    // Vertical (accelY): landing → HUD jolts up, airborne → floats down
    physicsTargets.yWiggle = _clamp(data.accelY * PHYSICS_SCALE.y, PHYSICS_CLAMP.yWiggle);

    // Lateral (accelX): cornering lean
    physicsTargets.roll = _clamp(data.accelX * PHYSICS_SCALE.roll, PHYSICS_CLAMP.roll);
}

// ── Spring integration ────────────────────────────────────────────────────────
var MAX_SPRING_VEL = 500; // px/s — normal driving peaks ~150, this gives 3x headroom

function _stepSpring(spring, target, dt) {
    var force = (target - spring.pos) * spring.stiffness - spring.vel * spring.damping;
    spring.vel += force * dt;
    spring.vel = _clamp(spring.vel, MAX_SPRING_VEL); // hard velocity cap
    spring.pos += spring.vel * dt;
}

function _atRest() {
    return Object.values(_springs).every(
        s => Math.abs(s.pos) < 0.01 && Math.abs(s.vel) < 0.01
    );
}

let _hudContainer = null;
let _lastPhysicsTime = null;

function _applyTransform() {
    if (!_hudContainer) return;

    var tx = _clamp(_springs.x.pos,       PHYSICS_CLAMP.x);
    var ty = _clamp(
        (_springs.yBias.pos + _springs.yWiggle.pos) * PHYSICS_SCALE.y,
        (PHYSICS_CLAMP.yBias + PHYSICS_CLAMP.yWiggle) * PHYSICS_SCALE.y
    );
    var tz = _clamp(_springs.z.pos * PHYSICS_SCALE.z,
                    PHYSICS_CLAMP.z * PHYSICS_SCALE.z);
    var rz = _springs.roll.pos;

    _hudContainer.style.transform =
        `translateX(${tx.toFixed(2)}px) ` +
        `translateY(${ty.toFixed(2)}px) ` +
        `translateZ(${tz.toFixed(2)}px) ` +
        `rotateZ(${rz.toFixed(3)}deg)`;
}

function _physicsLoop(timestamp) {
    requestAnimationFrame(_physicsLoop);

    // When disabled, let all springs decay naturally to zero
    const targets = _physicsEnabled
        ? physicsTargets
        : { x: 0, yBias: 0, yWiggle: 0, z: 0, roll: 0 };

    const dt = Math.min((timestamp - (_lastPhysicsTime ?? timestamp)) / 1000, 0.05);
    _lastPhysicsTime = timestamp;

    for (const key of Object.keys(_springs)) {
        _stepSpring(_springs[key], targets[key], dt);
    }

    if (!_physicsEnabled && _atRest()) {
        if (_hudContainer) _hudContainer.style.transform = '';
        _lastPhysicsTime = null;
    } else {
        _applyTransform();
    }
}

// ── Init — call once after .hud-container is in the DOM ──────────────────────
let _loopRunning = false;

export function initPhysics() {
    const wrapper = document.querySelector(`[data-hud="${window._activeHud ?? 'simple'}"]`);
    const found   = wrapper
        ? (wrapper.querySelector('[data-physics]') || wrapper.querySelector('.hud-container'))
        : document.querySelector('[data-physics]') || document.querySelector('.hud-container');

    if (!found) {
        console.error('[Physics] No physics target found for HUD:', window._activeHud);
        return;
    }
    _hudContainer = found;
    _syncUI();
    if (!_loopRunning) {
        _loopRunning = true;
        requestAnimationFrame(_physicsLoop);
        console.log('[Physics] Initialized, enabled:', _physicsEnabled);
    } else {
        console.log('[Physics] Container updated:', _hudContainer.id || _hudContainer.className);
    }
}

// ── Toggle ────────────────────────────────────────────────────────────────────
export function togglePhysics() {
    _physicsEnabled = !_physicsEnabled;
    localStorage.setItem('forza_hud_physics_enabled', _physicsEnabled);

    Object.keys(physicsTargets).forEach(k => physicsTargets[k] = 0);

    _syncUI();

    window.showNotification?.(
        _physicsEnabled ? '📳 HUD motion enabled' : '🔇 HUD motion disabled'
    );
}

function _syncUI() {
    // Settings panel toggle button
    const btn = document.getElementById('physics-btn');
    if (btn) btn.style.background = _physicsEnabled ? '' : 'rgba(255,255,255,0.05)';

    // Status text spans anywhere in the settings panel
    document.querySelectorAll('.physics-status-text').forEach(el => {
        el.textContent = _physicsEnabled ? 'ON' : 'OFF';
    });
}

// ── Expose on window for non-module script blocks ─────────────────────────────
window.updatePhysicsTargets = updatePhysicsTargets;
window.togglePhysics        = togglePhysics;
window.physicsTargets       = physicsTargets;
