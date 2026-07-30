// =============================================================================
// hud_overlay/shared/telemetry-cards/manager.js
// Central Orchestrator & State Manager for Telemetry Cards Cluster
// =============================================================================

import { corners } from './utils.js';
import { getClusterHTML } from './template.js';
import { renderGRadar } from './g-radar.js';
import { renderCorners } from './corner-card.js';
import { renderPedalWave } from './pedal-wave.js';
import { renderPowerTorque } from './power-torque.js';

export function createTelemetryCardsManager() {
    return {
        initialized: false,
        containerEl: null,
        lastScale: parseFloat((typeof localStorage !== 'undefined' && localStorage.getItem('forza_hud_tele_scale')) || '1.0'),
        lastOpacity: parseFloat((typeof localStorage !== 'undefined' && localStorage.getItem('forza_hud_tele_opacity')) || '0.85'),

        // Rolling history buffers for waveforms & peak markers
        suspHist: [[], [], [], []], // 2.5s history for FL, FR, RL, RR
        suspMinMax: [
            { min: null, max: null },
            { min: null, max: null },
            { min: null, max: null },
            { min: null, max: null }
        ],
        tireHist: [[], [], [], []], // 3s history for tire temp/slip distribution
        pedalHist: [],             // 5s history for throttle & brake inputs (300 points)
        powerTorqueHist: [],       // 5s history for RPM, Power, Torque (300 points)
        gHist: [],                 // 30s history for G-force peaks
        lastTime: typeof performance !== 'undefined' ? performance.now() : Date.now(),

        init: function (parentEl) {
            if (!parentEl) return;
            this.containerEl = parentEl;

            var initialScale = this.lastScale;
            var initialOpacity = this.lastOpacity;

            // HTML Template for Central Symmetric Cluster Layout
            parentEl.innerHTML = getClusterHTML(initialScale, initialOpacity);
            this.initialized = true;
        },

        update: function (data, config) {
            if (!this.containerEl) return;

            var fullConfig = config || (typeof window !== 'undefined' && window._currentFullConfig) || {};
            var elements = fullConfig.elements || (typeof window !== 'undefined' && window._currentHudElements) || {};

            if (fullConfig.telemetryScale !== undefined) {
                this.lastScale = fullConfig.telemetryScale;
                try { if (typeof localStorage !== 'undefined') localStorage.setItem('forza_hud_tele_scale', fullConfig.telemetryScale.toString()); } catch (e) {}
            }
            if (fullConfig.telemetryOpacity !== undefined) {
                this.lastOpacity = fullConfig.telemetryOpacity;
                try { if (typeof localStorage !== 'undefined') localStorage.setItem('forza_hud_tele_opacity', fullConfig.telemetryOpacity.toString()); } catch (e) {}
            }

            var tScale = this.lastScale * 0.75;
            var tOpacity = this.lastOpacity;
            var elemScale = fullConfig.telemetryCardElementScale !== undefined ? fullConfig.telemetryCardElementScale : 1.0;

            var wrapper = document.getElementById('tcClusterWrapper');
            if (wrapper) {
                wrapper.style.opacity = tOpacity;
                wrapper.style.transform = 'translate(-50%, -50%) scale(' + tScale + ')';
                if (typeof wrapper.style.setProperty === 'function') {
                    wrapper.style.setProperty('--tc-elem-scale', elemScale);
                }
            }

            var showAttitude = elements.showTeleAttitude !== false;
            var showSusp = elements.showTeleSuspension !== false;
            var showTires = elements.showTeleTires !== false;
            var showPedals = elements.showTelePedals !== false;
            var showCorners = showSusp || showTires;

            var centerContainer = document.getElementById('tcCenterRadarContainer');
            if (centerContainer) centerContainer.style.display = showAttitude ? 'flex' : 'none';

            var pedalContainer = document.getElementById('tcPedalWaveContainer');
            if (pedalContainer) pedalContainer.style.display = showPedals ? 'flex' : 'none';

            var powerTorqueContainer = document.getElementById('tcPowerTorqueContainer');
            if (powerTorqueContainer) powerTorqueContainer.style.display = elements.showPowerTorque !== false ? 'flex' : 'none';

            var topPedalSpacer = document.getElementById('tcTopPedalSpacer');
            if (topPedalSpacer) topPedalSpacer.style.display = showPedals ? 'flex' : 'none';

            var topPowerSpacer = document.getElementById('tcTopPowerSpacer');
            if (topPowerSpacer) topPowerSpacer.style.display = elements.showPowerTorque !== false ? 'flex' : 'none';

            corners.forEach(function (tag) {
                var cornerEl = document.getElementById('tcCorner' + tag);
                var suspBlock = document.getElementById('tcSuspBlock' + tag);
                var tireBlock = document.getElementById('tcTireBlock' + tag);
                var divider = document.getElementById('tcDivider' + tag);

                if (cornerEl) cornerEl.style.display = showCorners ? 'flex' : 'none';
                if (suspBlock) suspBlock.style.display = showSusp ? 'flex' : 'none';
                if (tireBlock) tireBlock.style.display = showTires ? 'flex' : 'none';
                if (divider) divider.style.display = (showSusp && showTires) ? 'block' : 'none';
            });

            if (!data) return;

            var now = typeof performance !== 'undefined' ? performance.now() : Date.now();

            // 1. Center G-Force Radar & Dynamics
            if (showAttitude) {
                renderGRadar(data, this.gHist, now);
            }

            // 2. Throttle & Brake 5-Second Input Trace Canvas
            if (showPedals) {
                renderPedalWave(data, this.pedalHist, now);
            }

            // 3. 4-Corner Tire Radars, Temp 3-Second Distribution Histograms & Suspension Bars
            renderCorners(data, showSusp, showTires, this.tireHist, this.suspHist, this.suspMinMax, now);

            // 4. Power & Torque Scatter Plot vs RPM
            if (elements.showPowerTorque !== false) {
                renderPowerTorque(data, this.powerTorqueHist, now);
            }
        },

        triggerClusterSweepAnimation: function () {
            var wrapper = document.getElementById('tcClusterWrapper');
            var gCircle = document.getElementById('tcGRadarCircle');
            var gDot = document.getElementById('tcGDot');
            if (!wrapper) return;

            wrapper.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s ease';
            wrapper.style.transform = 'translate(-50%, -50%) scale(0.92)';

            if (gCircle) {
                gCircle.style.boxShadow = '0 0 45px rgba(0, 240, 255, 0.6), inset 0 0 35px rgba(0, 240, 255, 0.4)';
            }
            if (gDot) {
                gDot.style.boxShadow = '0 0 25px #00f0ff, 0 0 50px rgba(0, 240, 255, 1)';
            }

            setTimeout(function () {
                wrapper.style.transform = 'translate(-50%, -50%) scale(1.0)';
                if (gCircle) {
                    gCircle.style.boxShadow = '0 0 25px rgba(0, 240, 255, 0.15), inset 0 0 25px rgba(0, 0, 0, 0.5)';
                }
                if (gDot) {
                    gDot.style.boxShadow = '0 0 16px #00f0ff, 0 0 30px rgba(0, 240, 255, 0.8)';
                }
            }, 450);
        }
    };
}

export const TelemetryCardsManager = createTelemetryCardsManager();
