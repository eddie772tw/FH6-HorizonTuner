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
import { renderLiveMap } from './live-map.js';

var DEFAULT_PRIMARY_COLOR = '#00f0ff';

export function createTelemetryCardsManager() {
    var _lastStyles = {};

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

            // Cache DOM elements
            this.domCache = {
                wrapper: document.getElementById('tcClusterWrapper'),
                liveMapContainer: document.getElementById('tcLiveMapContainer'),
                centerAnchor: document.getElementById('tcCenterAnchor'),
                centerRadar: document.getElementById('tcCenterRadarContainer'),
                gridLinesEl: document.getElementById('tcGridLines'),
                topEdgeContainer: document.getElementById('tcTopEdgeContainer'),
                bottomEdgeContainer: document.getElementById('tcBottomEdgeContainer'),
                pedalContainer: document.getElementById('tcPedalWaveContainer'),
                ptContainer: document.getElementById('tcPowerTorqueContainer'),
                gridContainer: document.getElementById('tcGridContainer'),
                liveMapCanvas: document.getElementById('tcLiveMapCanvas'),
                gCircle: document.getElementById('tcGRadarCircle'),
                gDot: document.getElementById('tcGDot'),
                corners: {}
            };
            for (var i = 0; i < corners.length; i++) {
                var tag = corners[i];
                this.domCache.corners[tag] = {
                    el: document.getElementById('tcCorner' + tag),
                    suspBlock: document.getElementById('tcSuspBlock' + tag),
                    slipBlock: document.getElementById('tcSlipBlock' + tag),
                    tempBlock: document.getElementById('tcTempBlock' + tag),
                    angEl: document.getElementById('tcTireAng' + tag),
                    ratEl: document.getElementById('tcTireRat' + tag),
                    rCanvas: document.getElementById('tcTireRadar' + tag),
                    tempEl: document.getElementById('tcTireTemp' + tag),
                    tCanvas: document.getElementById('tcTireHist' + tag),
                    txtEl: document.getElementById('tcSuspText' + tag),
                    barEl: document.getElementById('tcSuspBar' + tag),
                    minEl: document.getElementById('tcSuspMin' + tag),
                    maxEl: document.getElementById('tcSuspMax' + tag),
                    wCanvas: document.getElementById('tcSuspWave' + tag)
                };
            }
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
            var cornerOffsetX = fullConfig.telemetryCornerOffsetX || 0;
            var pedalOffsetX  = fullConfig.telemetryPedalOffsetX  || 0;
            var ptOffsetX     = fullConfig.telemetryPowerTorqueOffsetX || 0;

            var liveMapOffsetX = fullConfig.telemetryLiveMapOffsetX || 0;
            var liveMapOffsetY = fullConfig.telemetryLiveMapOffsetY || 0;
            var liveMapOpacity = fullConfig.telemetryLiveMapOpacity !== undefined ? fullConfig.telemetryLiveMapOpacity : 1.0;
            var liveMapScale   = fullConfig.telemetryLiveMapScale   !== undefined ? fullConfig.telemetryLiveMapScale   : 1.0;

            var useDefaultColors = fullConfig.useDefaultColors !== false;
            var primaryColor = useDefaultColors
                ? DEFAULT_PRIMARY_COLOR
                : (fullConfig.customColor || DEFAULT_PRIMARY_COLOR);
            var contrastColor = computeContrastColor(primaryColor);

            var wrapper = this.domCache ? this.domCache.wrapper : (typeof document !== 'undefined' ? document.getElementById('tcClusterWrapper') : null);
            if (wrapper) {
                wrapper.style.opacity = tOpacity;
                if (typeof wrapper.style.setProperty === 'function') {
                    if (_lastStyles['fontScale'] !== fontScale) { wrapper.style.setProperty('--tc-font-scale', fontScale); _lastStyles['fontScale'] = fontScale; }
                    if (_lastStyles['cornerOffsetY'] !== cornerOffsetY) { wrapper.style.setProperty('--tc-corner-offset-y', cornerOffsetY + 'px'); _lastStyles['cornerOffsetY'] = cornerOffsetY; }
                    if (_lastStyles['cornerOffsetX'] !== cornerOffsetX) { wrapper.style.setProperty('--tc-corner-offset-x', cornerOffsetX + 'px'); _lastStyles['cornerOffsetX'] = cornerOffsetX; }
                    if (_lastStyles['cornersScale'] !== cornersScale) { wrapper.style.setProperty('--tc-corners-scale', cornersScale.toString()); _lastStyles['cornersScale'] = cornersScale; }
                    if (_lastStyles['gRadarScale'] !== gRadarScale) { wrapper.style.setProperty('--tc-gradar-scale', gRadarScale.toString()); _lastStyles['gRadarScale'] = gRadarScale; }
                    if (_lastStyles['primaryColor'] !== primaryColor) { wrapper.style.setProperty('--card-primary', primaryColor); _lastStyles['primaryColor'] = primaryColor; }
                    if (_lastStyles['contrastColor'] !== contrastColor) { wrapper.style.setProperty('--card-contrast', contrastColor); _lastStyles['contrastColor'] = contrastColor; }
                }
            }

            var liveMapContainer = this.domCache ? this.domCache.liveMapContainer : document.getElementById('tcLiveMapContainer');
            if (liveMapContainer && typeof liveMapContainer.style.setProperty === 'function') {
                if (_lastStyles['liveMapOffsetX'] !== liveMapOffsetX) { liveMapContainer.style.setProperty('--tc-live-map-offset-x', liveMapOffsetX + 'px'); _lastStyles['liveMapOffsetX'] = liveMapOffsetX; }
                if (_lastStyles['liveMapOffsetY'] !== liveMapOffsetY) { liveMapContainer.style.setProperty('--tc-live-map-offset-y', liveMapOffsetY + 'px'); _lastStyles['liveMapOffsetY'] = liveMapOffsetY; }
                if (_lastStyles['liveMapOpacity'] !== liveMapOpacity) { liveMapContainer.style.setProperty('--tc-live-map-opacity',  liveMapOpacity.toString()); _lastStyles['liveMapOpacity'] = liveMapOpacity; }
                if (_lastStyles['liveMapScale'] !== liveMapScale) { liveMapContainer.style.setProperty('--tc-live-map-scale',    liveMapScale.toString()); _lastStyles['liveMapScale'] = liveMapScale; }
            }

            // ---- Element Visibility Toggles ----
            var showAttitude = elements.showTeleAttitude   !== false;
            var showSusp     = elements.showTeleSuspension !== false;
            var showTires    = elements.showTeleTires      !== false;
            var showSlip     = elements.showTeleTiresSlip !== undefined ? (elements.showTeleTiresSlip !== false) : showTires;
            var showTemp     = elements.showTeleTiresTemp !== undefined ? (elements.showTeleTiresTemp !== false) : showTires;
            var showPedals   = elements.showTelePedals     !== false;
            var showPT       = elements.showPowerTorque    !== false;
            var showLiveMap  = elements.showLiveMap        !== false;
            var showCorners  = showSusp || showSlip || showTemp;

            // ---- Central Anchor & Alignment Grid ----
            var showCenterAnchor = elements.showTeleCenterAnchor !== false;
            var showGridLines    = elements.showTeleGridLines === true;

            var centerAnchor = this.domCache ? this.domCache.centerAnchor : document.getElementById('tcCenterAnchor');
            if (centerAnchor) {
                centerAnchor.style.display     = (showAttitude || showCenterAnchor) ? 'flex' : 'flex';
                centerAnchor.style.visibility  = (showAttitude || showCenterAnchor) ? 'visible' : 'hidden';
                centerAnchor.style.borderStyle = showCenterAnchor ? 'dashed' : 'none';
            }

            var centerRadar = this.domCache ? this.domCache.centerRadar : document.getElementById('tcCenterRadarContainer');
            if (centerRadar) {
                centerRadar.style.display = showAttitude ? 'flex' : 'none';
            }

            var gridLinesEl = this.domCache ? this.domCache.gridLinesEl : document.getElementById('tcGridLines');
            if (gridLinesEl) {
                gridLinesEl.style.display = showGridLines ? 'block' : 'none';
            }

            // ---- Edge-Aligned Charts Positioning & Stacking ----
            var pedalPos     = fullConfig.telemetryPedalPosition       || 'bottom';
            var ptPos        = fullConfig.telemetryPowerTorquePosition || 'bottom';
            var mergedPos    = fullConfig.telemetryMergedChartsPosition || 'bottom';
            var mergedOffsetX = fullConfig.telemetryMergedChartsOffsetX || 0;
            var mergedScale   = (fullConfig.telemetryMergedChartsScale !== undefined) ? fullConfig.telemetryMergedChartsScale : 1.0;
            var sideBySide   = fullConfig.telemetrySideBySideCharts === true || elements.showTeleSideBySideCharts === true;

            var topEdgeContainer    = this.domCache ? this.domCache.topEdgeContainer : document.getElementById('tcTopEdgeContainer');
            var bottomEdgeContainer = this.domCache ? this.domCache.bottomEdgeContainer : document.getElementById('tcBottomEdgeContainer');

            var edgeContainers = [topEdgeContainer, bottomEdgeContainer];
            for (var i = 0; i < edgeContainers.length; i++) {
                var container = edgeContainers[i];
                if (container) {
                    container.style.opacity = tOpacity;
                    if (sideBySide) {
                        container.classList.add('tc-side-by-side');
                    } else {
                        container.classList.remove('tc-side-by-side');
                        container.style.transform = 'none';
                    }
                }
            }

            var targetMergedParent = (mergedPos === 'top') ? topEdgeContainer : bottomEdgeContainer;
            if (sideBySide && targetMergedParent) {
                targetMergedParent.style.transform = 'translateX(' + mergedOffsetX + 'px) scale(' + mergedScale + ')';
                var otherMergedContainer = (mergedPos === 'top') ? bottomEdgeContainer : topEdgeContainer;
                if (otherMergedContainer) {
                    otherMergedContainer.style.transform = 'none';
                }
            }

            var pedalContainer = this.domCache ? this.domCache.pedalContainer : document.getElementById('tcPedalWaveContainer');
            if (pedalContainer) {
                pedalContainer.style.display = showPedals ? 'flex' : 'none';
                if (sideBySide) {
                    pedalContainer.classList.add('tc-half-width');
                    pedalContainer.style.transform = 'none';
                } else {
                    pedalContainer.classList.remove('tc-half-width');
                    pedalContainer.style.transform = 'translateX(' + pedalOffsetX + 'px) scale(' + pedalScale + ')';
                }
                var targetPedalParent = (sideBySide ? targetMergedParent : ((pedalPos === 'top') ? topEdgeContainer : bottomEdgeContainer));
                if (targetPedalParent && pedalContainer.parentElement !== targetPedalParent) {
                    targetPedalParent.appendChild(pedalContainer);
                }
                if (typeof pedalContainer.style.setProperty === 'function') {
                    if (_lastStyles['pedalPrimary'] !== primaryColor) { pedalContainer.style.setProperty('--card-primary', primaryColor); _lastStyles['pedalPrimary'] = primaryColor; }
                    if (_lastStyles['pedalContrast'] !== contrastColor) { pedalContainer.style.setProperty('--card-contrast', contrastColor); _lastStyles['pedalContrast'] = contrastColor; }
                }
            }

            var ptContainer = this.domCache ? this.domCache.ptContainer : document.getElementById('tcPowerTorqueContainer');
            if (ptContainer) {
                ptContainer.style.display = showPT ? 'flex' : 'none';
                if (sideBySide) {
                    ptContainer.classList.add('tc-half-width');
                    ptContainer.style.transform = 'none';
                } else {
                    ptContainer.classList.remove('tc-half-width');
                    ptContainer.style.transform = 'translateX(' + ptOffsetX + 'px) scale(' + ptScale + ')';
                }
                var targetPtParent = (sideBySide ? targetMergedParent : ((ptPos === 'top') ? topEdgeContainer : bottomEdgeContainer));
                if (targetPtParent && ptContainer.parentElement !== targetPtParent) {
                    targetPtParent.appendChild(ptContainer);
                }
                if (typeof ptContainer.style.setProperty === 'function') {
                    if (_lastStyles['ptPrimary'] !== primaryColor) { ptContainer.style.setProperty('--card-primary', primaryColor); _lastStyles['ptPrimary'] = primaryColor; }
                    if (_lastStyles['ptContrast'] !== contrastColor) { ptContainer.style.setProperty('--card-contrast', contrastColor); _lastStyles['ptContrast'] = contrastColor; }
                }
            }


            // ---- Corner Cards (Grid vs Screen Edge Snap Layout) ----
            var cornerEdgeSnap = fullConfig.telemetryCornerEdgeSnap === true || elements.showTeleCornerEdgeSnap === true;

            var gridContainer = this.domCache ? this.domCache.gridContainer : document.getElementById('tcGridContainer');
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

            for (var i = 0; i < corners.length; i++) {
                var tag = corners[i];
                var cached = this.domCache && this.domCache.corners ? this.domCache.corners[tag] : null;
                var cornerEl  = cached ? cached.el : document.getElementById('tcCorner' + tag);
                var suspBlock = cached ? cached.suspBlock : document.getElementById('tcSuspBlock' + tag);
                var slipBlock = cached ? cached.slipBlock : document.getElementById('tcSlipBlock' + tag);
                var tempBlock = cached ? cached.tempBlock : document.getElementById('tcTempBlock' + tag);

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
            }

            var liveMapContainer = this.domCache ? this.domCache.liveMapContainer : document.getElementById('tcLiveMapContainer');
            if (liveMapContainer) {
                liveMapContainer.style.display = showLiveMap ? 'block' : 'none';
            }

            if (!data) return;

            var now = typeof performance !== 'undefined' ? performance.now() : Date.now();

            // Time-based cleanup: if game was paused or disconnected, clear old history
            if (now - this.lastTime > 1500) {
                this.suspHist = [[], [], [], []];
                this.suspMinMax = [
                    { min: null, max: null },
                    { min: null, max: null },
                    { min: null, max: null },
                    { min: null, max: null }
                ];
                this.tireHist = [[], [], [], []];
                this.pedalHist = [];
                this.powerTorqueHist = [];
                this.gHist = [];
            }
            this.lastTime = now;

            if (showAttitude) {
                renderGRadar(data, this.gHist, now);
            }

            if (showPedals) {
                renderPedalWave(data, this.pedalHist, now);
            }

            if (showCorners) {
                renderCorners(data, showSusp, showSlip, showTemp, this.tireHist, this.suspHist, this.suspMinMax, now, this.domCache);
            }

            if (showPT) {
                renderPowerTorque(data, this.powerTorqueHist, now);
            }

            if (showLiveMap) {
                var liveMapCanvas = this.domCache ? this.domCache.liveMapCanvas : document.getElementById('tcLiveMapCanvas');
                if (liveMapCanvas) {
                    renderLiveMap(liveMapCanvas, data, fullConfig);
                }
            }
        },

        // -----------------------------------------------------------------------
        triggerClusterSweepAnimation: function () {
            var wrapper = this.domCache ? this.domCache.wrapper : (typeof document !== 'undefined' ? document.getElementById('tcClusterWrapper') : null);
            var gCircle = this.domCache ? this.domCache.gCircle : document.getElementById('tcGRadarCircle');
            var gDot    = this.domCache ? this.domCache.gDot : document.getElementById('tcGDot');
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
        },

        // -----------------------------------------------------------------------
        destroy: function () {
            this.suspHist = [[], [], [], []];
            this.suspMinMax = [
                { min: null, max: null },
                { min: null, max: null },
                { min: null, max: null },
                { min: null, max: null }
            ];
            this.tireHist = [[], [], [], []];
            this.pedalHist = [];
            this.powerTorqueHist = [];
            this.gHist = [];

            if (this.containerEl) {
                this.containerEl.innerHTML = '';
            }
            this.initialized = false;
        }
    };
}

export const TelemetryCardsManager = createTelemetryCardsManager();
