// =============================================================================
// hud_overlay/shared/telemetry-cards/manager.js
// Central Orchestrator & State Manager for Telemetry Cards Cluster
// =============================================================================

import { corners, computeContrastColor } from './utils.js';
import { getClusterHTML } from './template.js';
import { renderGRadar } from './g-radar.js';
import { renderCorners } from './corner-card.js';
import { renderPedalWave } from './pedal-wave.js';
import { renderPowerTorque } from './power-torque.js';

var DEFAULT_PRIMARY_COLOR = '#00f0ff';

export function createTelemetryCardsManager() {
    return {
        initialized: false,
        containerEl: null,

        lastOpacity: parseFloat((typeof localStorage !== 'undefined' && localStorage.getItem('forza_hud_tele_opacity')) || '0.85'),

        suspHist:   [[], [], [], []],
        suspMinMax: [
            { min: null, max: null },
            { min: null, max: null },
            { min: null, max: null },
            { min: null, max: null }
        ],
        tireHist:        [[], [], [], []],
        pedalHist:       [],
        powerTorqueHist: [],
        gHist:           [],
        lastTime: typeof performance !== 'undefined' ? performance.now() : Date.now(),

        // -----------------------------------------------------------------------
        init: function (parentEl) {
            if (!parentEl) return;
            this.containerEl = parentEl;

            var initialOpacity = this.lastOpacity;

            parentEl.innerHTML = getClusterHTML(1.0, initialOpacity);
            this.initialized = true;
        },

        // -----------------------------------------------------------------------
        update: function (data, config) {
            if (!this.containerEl) return;

            var fullConfig = config || (typeof window !== 'undefined' && window._currentFullConfig) || {};
            var elements   = fullConfig.elements || (typeof window !== 'undefined' && window._currentHudElements) || {};

            if (fullConfig.telemetryOpacity !== undefined) {
                this.lastOpacity = fullConfig.telemetryOpacity;
                try { if (typeof localStorage !== 'undefined') localStorage.setItem('forza_hud_tele_opacity', fullConfig.telemetryOpacity.toString()); } catch (e) {}
            }

            var tOpacity = this.lastOpacity;

            var fontScale = fullConfig.telemetryCardFontScale !== undefined ? fullConfig.telemetryCardFontScale : 1.0;
            fontScale = Math.max(0.5, Math.min(2.0, fontScale));

            // 4 Independent Component Scales
            var gRadarScale = fullConfig.telemetryGRadarScale !== undefined ? fullConfig.telemetryGRadarScale : 1.0;
            var cornersScale = fullConfig.telemetryCornersScale !== undefined ? fullConfig.telemetryCornersScale : 1.0;
            var pedalScale   = fullConfig.telemetryPedalScale !== undefined ? fullConfig.telemetryPedalScale : 1.0;
            var ptScale      = fullConfig.telemetryPowerTorqueScale !== undefined ? fullConfig.telemetryPowerTorqueScale : 1.0;

            var cornerOffsetY = fullConfig.telemetryCornerOffsetY || 0;
            var pedalOffsetX  = fullConfig.telemetryPedalOffsetX  || 0;
            var ptOffsetX     = fullConfig.telemetryPowerTorqueOffsetX || 0;

            var useDefaultColors = fullConfig.useDefaultColors !== false;
            var primaryColor = useDefaultColors
                ? DEFAULT_PRIMARY_COLOR
                : (fullConfig.customColor || DEFAULT_PRIMARY_COLOR);
            var contrastColor = computeContrastColor(primaryColor);

            var wrapper = document.getElementById('tcClusterWrapper');
            if (wrapper) {
                wrapper.style.opacity = tOpacity;
                if (typeof wrapper.style.setProperty === 'function') {
                    wrapper.style.setProperty('--tc-font-scale',      fontScale);
                    wrapper.style.setProperty('--tc-corner-offset-y',  cornerOffsetY + 'px');
                    wrapper.style.setProperty('--tc-corners-scale',    cornersScale.toString());
                    wrapper.style.setProperty('--tc-gradar-scale',     gRadarScale.toString());
                    wrapper.style.setProperty('--card-primary',       primaryColor);
                    wrapper.style.setProperty('--card-contrast',      contrastColor);
                }
            }

            // ---- Element Visibility Toggles ----
            var showAttitude = elements.showTeleAttitude   !== false;
            var showSusp     = elements.showTeleSuspension !== false;
            var showTires    = elements.showTeleTires      !== false;
            var showSlip     = elements.showTeleTiresSlip !== undefined ? (elements.showTeleTiresSlip !== false) : showTires;
            var showTemp     = elements.showTeleTiresTemp !== undefined ? (elements.showTeleTiresTemp !== false) : showTires;
            var showPedals   = elements.showTelePedals     !== false;
            var showPT       = elements.showPowerTorque    !== false;
            var showCorners  = showSusp || showSlip || showTemp;

            // ---- Central Anchor & Alignment Grid ----
            var showCenterAnchor = elements.showTeleCenterAnchor !== false;
            var showGridLines    = elements.showTeleGridLines === true;

            var centerAnchor = document.getElementById('tcCenterAnchor');
            if (centerAnchor) {
                centerAnchor.style.display     = (showAttitude || showCenterAnchor) ? 'flex' : 'flex';
                centerAnchor.style.visibility  = (showAttitude || showCenterAnchor) ? 'visible' : 'hidden';
                centerAnchor.style.borderStyle = showCenterAnchor ? 'dashed' : 'none';
            }

            var centerRadar = document.getElementById('tcCenterRadarContainer');
            if (centerRadar) {
                centerRadar.style.display = showAttitude ? 'flex' : 'none';
            }

            var gridLinesEl = document.getElementById('tcGridLines');
            if (gridLinesEl) {
                gridLinesEl.style.display = showGridLines ? 'block' : 'none';
            }

            // ---- Edge-Aligned Charts Positioning & Stacking ----
            var pedalPos   = fullConfig.telemetryPedalPosition       || 'bottom';
            var ptPos      = fullConfig.telemetryPowerTorquePosition || 'bottom';
            var sideBySide = fullConfig.telemetrySideBySideCharts === true || elements.showTeleSideBySideCharts === true;

            var topEdgeContainer    = document.getElementById('tcTopEdgeContainer');
            var bottomEdgeContainer = document.getElementById('tcBottomEdgeContainer');

            [topEdgeContainer, bottomEdgeContainer].forEach(function (container) {
                if (container) {
                    if (sideBySide) {
                        container.classList.add('tc-side-by-side');
                    } else {
                        container.classList.remove('tc-side-by-side');
                    }
                }
            });

            var pedalContainer = document.getElementById('tcPedalWaveContainer');
            if (pedalContainer) {
                pedalContainer.style.display = showPedals ? 'flex' : 'none';
                if (sideBySide) {
                    pedalContainer.classList.add('tc-half-width');
                } else {
                    pedalContainer.classList.remove('tc-half-width');
                }
                var targetPedalParent = (sideBySide ? bottomEdgeContainer : ((pedalPos === 'top') ? topEdgeContainer : bottomEdgeContainer));
                if (targetPedalParent && pedalContainer.parentElement !== targetPedalParent) {
                    targetPedalParent.appendChild(pedalContainer);
                }
                // In side-by-side mode, clear translateX so charts appear adjacent
                pedalContainer.style.transform = sideBySide
                    ? 'scale(' + pedalScale + ')'
                    : 'translateX(' + pedalOffsetX + 'px) scale(' + pedalScale + ')';
                if (typeof pedalContainer.style.setProperty === 'function') {
                    pedalContainer.style.setProperty('--card-primary',  primaryColor);
                    pedalContainer.style.setProperty('--card-contrast', contrastColor);
                }
            }

            var ptContainer = document.getElementById('tcPowerTorqueContainer');
            if (ptContainer) {
                ptContainer.style.display = showPT ? 'flex' : 'none';
                if (sideBySide) {
                    ptContainer.classList.add('tc-half-width');
                } else {
                    ptContainer.classList.remove('tc-half-width');
                }
                var targetPtParent = (sideBySide ? bottomEdgeContainer : ((ptPos === 'top') ? topEdgeContainer : bottomEdgeContainer));
                if (targetPtParent && ptContainer.parentElement !== targetPtParent) {
                    targetPtParent.appendChild(ptContainer);
                }
                // In side-by-side mode, clear translateX so charts appear adjacent
                ptContainer.style.transform = sideBySide
                    ? 'scale(' + ptScale + ')'
                    : 'translateX(' + ptOffsetX + 'px) scale(' + ptScale + ')';
                if (typeof ptContainer.style.setProperty === 'function') {
                    ptContainer.style.setProperty('--card-primary',  primaryColor);
                    ptContainer.style.setProperty('--card-contrast', contrastColor);
                }
            }

            // ---- Corner Cards (Grid vs Screen Edge Snap Layout) ----
            var cornerEdgeSnap = fullConfig.telemetryCornerEdgeSnap === true || elements.showTeleCornerEdgeSnap === true;

            var gridContainer = document.getElementById('tcGridContainer');
            if (gridContainer) {
                if (cornerEdgeSnap) {
                    gridContainer.classList.add('tc-edge-snapped-corners');
                } else {
                    gridContainer.classList.remove('tc-edge-snapped-corners');
                }
            }

            var cornerOrigins = cornerEdgeSnap ? {
                FL: 'bottom left',
                FR: 'bottom right',
                RL: 'top left',
                RR: 'top right'
            } : {
                FL: 'bottom right',
                FR: 'bottom left',
                RL: 'top right',
                RR: 'top left'
            };

            corners.forEach(function (tag) {
                var cornerEl  = document.getElementById('tcCorner'    + tag);
                var suspBlock = document.getElementById('tcSuspBlock' + tag);
                var slipBlock = document.getElementById('tcSlipBlock' + tag);
                var tempBlock = document.getElementById('tcTempBlock' + tag);

                if (cornerEl) {
                    cornerEl.style.transformOrigin = cornerOrigins[tag];
                    if (showCorners) {
                        cornerEl.style.display    = 'flex';
                        cornerEl.style.visibility = 'visible';
                    } else {
                        cornerEl.style.display    = 'flex';
                        cornerEl.style.visibility = 'hidden';
                    }
                }
                if (suspBlock) suspBlock.style.display = showSusp ? 'flex' : 'none';
                if (slipBlock) slipBlock.style.display = showSlip ? 'flex' : 'none';
                if (tempBlock) tempBlock.style.display = showTemp ? 'flex' : 'none';
            });

            if (!data) return;

            var now = typeof performance !== 'undefined' ? performance.now() : Date.now();

            if (showAttitude) {
                renderGRadar(data, this.gHist, now);
            }

            if (showPedals) {
                renderPedalWave(data, this.pedalHist, now);
            }

            renderCorners(data, showSusp, showSlip, showTemp, this.tireHist, this.suspHist, this.suspMinMax, now);

            if (showPT) {
                renderPowerTorque(data, this.powerTorqueHist, now);
            }
        },

        // -----------------------------------------------------------------------
        triggerClusterSweepAnimation: function () {
            var wrapper = document.getElementById('tcClusterWrapper');
            var gCircle = document.getElementById('tcGRadarCircle');
            var gDot    = document.getElementById('tcGDot');
            if (!wrapper) return;

            wrapper.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s ease';
            wrapper.style.transform  = 'translate(-50%, -50%) scale(0.92)';

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
