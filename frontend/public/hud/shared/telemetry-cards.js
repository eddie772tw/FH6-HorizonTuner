// =============================================================================
// shared/telemetry-cards.js
// Shared Full-Screen Central Telemetry Cluster Renderer for All HUD Styles
// Features: 75vh Center G-Force Radar (with 9 o'clock LAT G & 6 o'clock LON G),
// 4-Corner Vertical Symmetric Cards (Suspension & Tire Temp 3s Histogram Distribution),
// and 5-Second Throttle & Brake Input Waveform Trace (THROTTLE Top-Right, BRAKE Bottom-Right).
// =============================================================================

(function (window) {
    'use strict';

    var corners = ['FL', 'FR', 'RL', 'RR'];

    function getTempColor(tempC) {
        if (tempC < 60) return '#0088ff';
        if (tempC < 105) return '#00ff00';
        if (tempC < 130) return '#ffaa00';
        return '#ff0000';
    }

    var TelemetryCardsManager = {
        initialized: false,
        containerEl: null,
        lastScale: parseFloat(localStorage.getItem('forza_hud_tele_scale') || '1.0'),
        lastOpacity: parseFloat(localStorage.getItem('forza_hud_tele_opacity') || '0.85'),

        // Rolling history buffer for waveforms & peak markers
        suspHist: [[], [], [], []], // 2.5s history for FL, FR, RL, RR
        suspMinMax: [
            { min: null, max: null },
            { min: null, max: null },
            { min: null, max: null },
            { min: null, max: null }
        ],
        tireHist: [[], [], [], []], // 3s history for tire temp/slip distribution
        pedalHist: [],             // 5s history for throttle & brake inputs (300 points)
        gHist: [],                 // 30s history for G-force peaks
        lastTime: performance.now(),

        init: function (parentEl) {
            if (!parentEl) return;
            this.containerEl = parentEl;

            var initialScale = this.lastScale;
            var initialOpacity = this.lastOpacity;

            // HTML Template for Central Symmetric Cluster Layout
            parentEl.innerHTML = `
                <div id="tcClusterWrapper" class="tele-cluster-wrapper" style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) scale(${initialScale});
                    pointer-events: none;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    z-index: 999;
                    opacity: ${initialOpacity};
                    transition: opacity 0.2s ease;
                ">
                    <!-- 3x4 Grid Layout: 4 Corners + Center G-Force Radar + Bottom Pedal Trace -->
                    <div id="tcGridContainer" style="
                        display: grid;
                        grid-template-columns: auto auto auto;
                        grid-template-rows: auto auto auto auto;
                        column-gap: 2.5vw;
                        row-gap: 1.5vh;
                        align-items: center;
                        justify-items: center;
                    ">
                        <!-- Row 1, Col 1: FL Corner (Front Left - Vertical Layout) -->
                        <div id="tcCornerFL" class="tele-corner" style="grid-column:1; grid-row:1; display:flex; flex-direction:column; gap:0.5rem; align-items:flex-start; background:rgba(0,0,0,0.35); backdrop-filter:blur(6px); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid rgba(0,240,255,0.2);">
                            <!-- FL Suspension Block -->
                            <div id="tcSuspBlockFL" style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
                                <div style="display:flex; justify-content:space-between; width:100%; font-size:0.75rem; color:#00f0ff; font-weight:bold;">
                                    <span>FL SUSP</span>
                                    <span id="tcSuspTextFL" style="font-family:monospace; color:#fff;">0.00</span>
                                </div>
                                <div style="display:flex; flex-direction:row; gap:6px; align-items:center;">
                                    <div style="position:relative; width:14px; height:10vh; background:rgba(255,255,255,0.08); border-radius:6px; overflow:hidden; border:1px solid rgba(255,255,255,0.15);">
                                        <div id="tcSuspBarFL" style="position:absolute; bottom:0; left:0; right:0; height:50%; background:#00f0ff; transition:height 0.05s linear; border-radius:0 0 5px 5px;"></div>
                                    </div>
                                    <canvas id="tcSuspWaveFL" width="110" height="60" style="height:10vh; width:auto; border-radius:4px; background:rgba(0,0,0,0.2);"></canvas>
                                </div>
                                <div style="display:flex; justify-content:space-between; width:100%; font-size:0.65rem; color:#aaa;">
                                    <span>Min: <span id="tcSuspMinFL" style="color:#fff;">0.00</span></span>
                                    <span>Max: <span id="tcSuspMaxFL" style="color:#fff;">0.00</span></span>
                                </div>
                            </div>

                            <!-- Divider -->
                            <div id="tcDividerFL" style="width:100%; height:1px; background:rgba(255,255,255,0.15);"></div>

                            <!-- FL Tire Block -->
                            <div id="tcTireBlockFL" style="display:flex; flex-direction:column; gap:4px; align-items:center;">
                                <div style="font-size:0.75rem; color:#00f0ff; font-weight:bold;">FL TIRE</div>
                                <div style="display:flex; gap:6px; align-items:center;">
                                    <canvas id="tcTireRadarFL" width="70" height="70" style="width:10vh; height:10vh;"></canvas>
                                    <div style="display:flex; flex-direction:column; align-items:center;">
                                        <span id="tcTireTempFL" style="font-size:0.75rem; font-weight:bold; color:#fff;">0°C</span>
                                        <canvas id="tcTireHistFL" width="60" height="50" style="width:9vh; height:7.5vh; background:rgba(255,255,255,0.03); border-radius:4px;"></canvas>
                                    </div>
                                </div>
                                <div style="display:flex; gap:8px; font-size:0.65rem; font-family:monospace; color:#aaa;">
                                    <span>Ang: <span id="tcTireAngFL" style="color:#fff;">0.00</span></span>
                                    <span>Slip: <span id="tcTireRatFL" style="color:#fff;">0.00</span></span>
                                </div>
                            </div>
                        </div>

                        <!-- Row 1, Col 3: FR Corner (Front Right - Vertical & Symmetric) -->
                        <div id="tcCornerFR" class="tele-corner" style="grid-column:3; grid-row:1; display:flex; flex-direction:column; gap:0.5rem; align-items:flex-end; background:rgba(0,0,0,0.35); backdrop-filter:blur(6px); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid rgba(0,240,255,0.2);">
                            <!-- FR Suspension Block -->
                            <div id="tcSuspBlockFR" style="display:flex; flex-direction:column; gap:4px; align-items:flex-end;">
                                <div style="display:flex; justify-content:space-between; width:100%; font-size:0.75rem; color:#00f0ff; font-weight:bold;">
                                    <span id="tcSuspTextFR" style="font-family:monospace; color:#fff;">0.00</span>
                                    <span>FR SUSP</span>
                                </div>
                                <div style="display:flex; flex-direction:row-reverse; gap:6px; align-items:center;">
                                    <div style="position:relative; width:14px; height:10vh; background:rgba(255,255,255,0.08); border-radius:6px; overflow:hidden; border:1px solid rgba(255,255,255,0.15);">
                                        <div id="tcSuspBarFR" style="position:absolute; bottom:0; left:0; right:0; height:50%; background:#00f0ff; transition:height 0.05s linear; border-radius:0 0 5px 5px;"></div>
                                    </div>
                                    <canvas id="tcSuspWaveFR" width="110" height="60" style="height:10vh; width:auto; border-radius:4px; background:rgba(0,0,0,0.2);"></canvas>
                                </div>
                                <div style="display:flex; justify-content:space-between; width:100%; font-size:0.65rem; color:#aaa;">
                                    <span>Max: <span id="tcSuspMaxFR" style="color:#fff;">0.00</span></span>
                                    <span>Min: <span id="tcSuspMinFR" style="color:#fff;">0.00</span></span>
                                </div>
                            </div>

                            <!-- Divider -->
                            <div id="tcDividerFR" style="width:100%; height:1px; background:rgba(255,255,255,0.15);"></div>

                            <!-- FR Tire Block -->
                            <div id="tcTireBlockFR" style="display:flex; flex-direction:column; gap:4px; align-items:center;">
                                <div style="font-size:0.75rem; color:#00f0ff; font-weight:bold;">FR TIRE</div>
                                <div style="display:flex; flex-direction:row-reverse; gap:6px; align-items:center;">
                                    <canvas id="tcTireRadarFR" width="70" height="70" style="width:10vh; height:10vh;"></canvas>
                                    <div style="display:flex; flex-direction:column; align-items:center;">
                                        <span id="tcTireTempFR" style="font-size:0.75rem; font-weight:bold; color:#fff;">0°C</span>
                                        <canvas id="tcTireHistFR" width="60" height="50" style="width:9vh; height:7.5vh; background:rgba(255,255,255,0.03); border-radius:4px;"></canvas>
                                    </div>
                                </div>
                                <div style="display:flex; gap:8px; font-size:0.65rem; font-family:monospace; color:#aaa;">
                                    <span>Slip: <span id="tcTireRatFR" style="color:#fff;">0.00</span></span>
                                    <span>Ang: <span id="tcTireAngFR" style="color:#fff;">0.00</span></span>
                                </div>
                            </div>
                        </div>

                        <!-- Row 2, Col 2: Center Core (G-Force Radar: 75vh at 100% scale) -->
                        <div id="tcCenterRadarContainer" style="
                            grid-column: 2;
                            grid-row: 1 / span 3;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            position: relative;
                            width: 75vh;
                            height: 75vh;
                        ">
                            <!-- Outer Circular G-Radar -->
                            <div id="tcGRadarCircle" style="
                                position: relative;
                                width: 100%;
                                height: 100%;
                                border-radius: 50%;
                                background: rgba(0, 0, 0, 0.25);
                                backdrop-filter: blur(8px);
                                border: 2px solid rgba(0, 240, 255, 0.35);
                                box-shadow: 0 0 25px rgba(0, 240, 255, 0.15), inset 0 0 25px rgba(0, 0, 0, 0.5);
                                display: flex;
                                justify-content: center;
                                align-items: center;
                            ">
                                <!-- Inner Threshold Circle (50% scale) -->
                                <div style="position:absolute; width:50%; height:50%; border-radius:50%; border:1.5px dashed rgba(0, 240, 255, 0.25);"></div>
                                <div style="position:absolute; width:25%; height:25%; border-radius:50%; border:1px dashed rgba(255, 255, 255, 0.15);"></div>
                                <!-- Crosshairs -->
                                <div style="position:absolute; width:100%; height:1px; background:rgba(255,255,255,0.2);"></div>
                                <div style="position:absolute; width:1px; height:100%; background:rgba(255,255,255,0.2);"></div>
                                <!-- Direction Labels -->
                                <span style="position:absolute; top:8px; font-size:0.8rem; color:rgba(255,255,255,0.6); font-weight:bold; letter-spacing:1px;">BRAKE</span>
                                <span style="position:absolute; bottom:8px; font-size:0.8rem; color:rgba(255,255,255,0.6); font-weight:bold; letter-spacing:1px;">ACCEL</span>
                                <span style="position:absolute; left:12px; font-size:0.8rem; color:rgba(255,255,255,0.6); font-weight:bold;">L</span>
                                <span style="position:absolute; right:12px; font-size:0.8rem; color:rgba(255,255,255,0.6); font-weight:bold;">R</span>

                                <!-- 9 o'clock Position (Left): LAT G Readout Chip -->
                                <div style="
                                    position: absolute;
                                    left: -18px;
                                    top: 50%;
                                    transform: translateY(-50%);
                                    background: rgba(0, 0, 0, 0.65);
                                    backdrop-filter: blur(6px);
                                    padding: 0.35rem 0.7rem;
                                    border-radius: 12px;
                                    border: 1px solid rgba(0, 240, 255, 0.4);
                                    display: flex;
                                    flex-direction: column;
                                    align-items: center;
                                    font-family: 'ForzaGear', Arial, sans-serif;
                                    z-index: 10;
                                    box-shadow: 0 0 12px rgba(0, 240, 255, 0.2);
                                ">
                                    <span style="font-size:0.65rem; color:#aaa; letter-spacing:1px;">LAT G</span>
                                    <strong id="tcLatG" style="font-size:1.1rem; color:#00f0ff;">0.00</strong>
                                </div>

                                <!-- 6 o'clock Position (Bottom Center): LON G Readout Chip -->
                                <div style="
                                    position: absolute;
                                    bottom: -18px;
                                    left: 50%;
                                    transform: translateX(-50%);
                                    background: rgba(0, 0, 0, 0.65);
                                    backdrop-filter: blur(6px);
                                    padding: 0.35rem 0.7rem;
                                    border-radius: 12px;
                                    border: 1px solid rgba(255, 0, 136, 0.4);
                                    display: flex;
                                    flex-direction: column;
                                    align-items: center;
                                    font-family: 'ForzaGear', Arial, sans-serif;
                                    z-index: 10;
                                    box-shadow: 0 0 12px rgba(255, 0, 136, 0.2);
                                ">
                                    <span style="font-size:0.65rem; color:#aaa; letter-spacing:1px;">LON G</span>
                                    <strong id="tcLonG" style="font-size:1.1rem; color:#ff0088;">0.00</strong>
                                </div>

                                <!-- 30s History Peak Markers Container -->
                                <div id="tcGMarkers" style="position:absolute; inset:0; pointer-events:none;"></div>

                                <!-- Dynamic G-Dot -->
                                <div id="tcGDot" style="
                                    position: absolute;
                                    width: 18px;
                                    height: 18px;
                                    background-color: #00f0ff;
                                    border-radius: 50%;
                                    box-shadow: 0 0 16px #00f0ff, 0 0 30px rgba(0, 240, 255, 0.8);
                                    transition: transform 0.05s linear;
                                    transform: translate(0px, 0px);
                                "></div>
                            </div>
                        </div>

                        <!-- Row 3, Col 1: RL Corner (Rear Left - Vertical Layout) -->
                        <div id="tcCornerRL" class="tele-corner" style="grid-column:1; grid-row:3; display:flex; flex-direction:column; gap:0.5rem; align-items:flex-start; background:rgba(0,0,0,0.35); backdrop-filter:blur(6px); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid rgba(0,240,255,0.2);">
                            <!-- RL Suspension Block -->
                            <div id="tcSuspBlockRL" style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
                                <div style="display:flex; justify-content:space-between; width:100%; font-size:0.75rem; color:#00f0ff; font-weight:bold;">
                                    <span>RL SUSP</span>
                                    <span id="tcSuspTextRL" style="font-family:monospace; color:#fff;">0.00</span>
                                </div>
                                <div style="display:flex; flex-direction:row; gap:6px; align-items:center;">
                                    <div style="position:relative; width:14px; height:10vh; background:rgba(255,255,255,0.08); border-radius:6px; overflow:hidden; border:1px solid rgba(255,255,255,0.15);">
                                        <div id="tcSuspBarRL" style="position:absolute; bottom:0; left:0; right:0; height:50%; background:#00f0ff; transition:height 0.05s linear; border-radius:0 0 5px 5px;"></div>
                                    </div>
                                    <canvas id="tcSuspWaveRL" width="110" height="60" style="height:10vh; width:auto; border-radius:4px; background:rgba(0,0,0,0.2);"></canvas>
                                </div>
                                <div style="display:flex; justify-content:space-between; width:100%; font-size:0.65rem; color:#aaa;">
                                    <span>Min: <span id="tcSuspMinRL" style="color:#fff;">0.00</span></span>
                                    <span>Max: <span id="tcSuspMaxRL" style="color:#fff;">0.00</span></span>
                                </div>
                            </div>

                            <!-- Divider -->
                            <div id="tcDividerRL" style="width:100%; height:1px; background:rgba(255,255,255,0.15);"></div>

                            <!-- RL Tire Block -->
                            <div id="tcTireBlockRL" style="display:flex; flex-direction:column; gap:4px; align-items:center;">
                                <div style="font-size:0.75rem; color:#00f0ff; font-weight:bold;">RL TIRE</div>
                                <div style="display:flex; gap:6px; align-items:center;">
                                    <canvas id="tcTireRadarRL" width="70" height="70" style="width:10vh; height:10vh;"></canvas>
                                    <div style="display:flex; flex-direction:column; align-items:center;">
                                        <span id="tcTireTempRL" style="font-size:0.75rem; font-weight:bold; color:#fff;">0°C</span>
                                        <canvas id="tcTireHistRL" width="60" height="50" style="width:9vh; height:7.5vh; background:rgba(255,255,255,0.03); border-radius:4px;"></canvas>
                                    </div>
                                </div>
                                <div style="display:flex; gap:8px; font-size:0.65rem; font-family:monospace; color:#aaa;">
                                    <span>Ang: <span id="tcTireAngRL" style="color:#fff;">0.00</span></span>
                                    <span>Slip: <span id="tcTireRatRL" style="color:#fff;">0.00</span></span>
                                </div>
                            </div>
                        </div>

                        <!-- Row 3, Col 3: RR Corner (Rear Right - Vertical & Symmetric) -->
                        <div id="tcCornerRR" class="tele-corner" style="grid-column:3; grid-row:3; display:flex; flex-direction:column; gap:0.5rem; align-items:flex-end; background:rgba(0,0,0,0.35); backdrop-filter:blur(6px); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid rgba(0,240,255,0.2);">
                            <!-- RR Suspension Block -->
                            <div id="tcSuspBlockRR" style="display:flex; flex-direction:column; gap:4px; align-items:flex-end;">
                                <div style="display:flex; justify-content:space-between; width:100%; font-size:0.75rem; color:#00f0ff; font-weight:bold;">
                                    <span id="tcSuspTextRR" style="font-family:monospace; color:#fff;">0.00</span>
                                    <span>RR SUSP</span>
                                </div>
                                <div style="display:flex; flex-direction:row-reverse; gap:6px; align-items:center;">
                                    <div style="position:relative; width:14px; height:10vh; background:rgba(255,255,255,0.08); border-radius:6px; overflow:hidden; border:1px solid rgba(255,255,255,0.15);">
                                        <div id="tcSuspBarRR" style="position:absolute; bottom:0; left:0; right:0; height:50%; background:#00f0ff; transition:height 0.05s linear; border-radius:0 0 5px 5px;"></div>
                                    </div>
                                    <canvas id="tcSuspWaveRR" width="110" height="60" style="height:10vh; width:auto; border-radius:4px; background:rgba(0,0,0,0.2);"></canvas>
                                </div>
                                <div style="display:flex; justify-content:space-between; width:100%; font-size:0.65rem; color:#aaa;">
                                    <span>Max: <span id="tcSuspMaxRR" style="color:#fff;">0.00</span></span>
                                    <span>Min: <span id="tcSuspMinRR" style="color:#fff;">0.00</span></span>
                                </div>
                            </div>

                            <!-- Divider -->
                            <div id="tcDividerRR" style="width:100%; height:1px; background:rgba(255,255,255,0.15);"></div>

                            <!-- RR Tire Block -->
                            <div id="tcTireBlockRR" style="display:flex; flex-direction:column; gap:4px; align-items:center;">
                                <div style="font-size:0.75rem; color:#00f0ff; font-weight:bold;">RR TIRE</div>
                                <div style="display:flex; flex-direction:row-reverse; gap:6px; align-items:center;">
                                    <canvas id="tcTireRadarRR" width="70" height="70" style="width:10vh; height:10vh;"></canvas>
                                    <div style="display:flex; flex-direction:column; align-items:center;">
                                        <span id="tcTireTempRR" style="font-size:0.75rem; font-weight:bold; color:#fff;">0°C</span>
                                        <canvas id="tcTireHistRR" width="60" height="50" style="width:9vh; height:7.5vh; background:rgba(255,255,255,0.03); border-radius:4px;"></canvas>
                                    </div>
                                </div>
                                <div style="display:flex; gap:8px; font-size:0.65rem; font-family:monospace; color:#aaa;">
                                    <span>Slip: <span id="tcTireRatRR" style="color:#fff;">0.00</span></span>
                                    <span>Ang: <span id="tcTireAngRR" style="color:#fff;">0.00</span></span>
                                </div>
                            </div>
                        </div>

                        <!-- Row 4, Col 2: Throttle & Brake 5-Second Input Trace -->
                        <div id="tcPedalWaveContainer" style="
                            grid-column: 2;
                            grid-row: 4;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            width: 75vh;
                            margin-top: 1.2vh;
                            background: rgba(0, 0, 0, 0.4);
                            backdrop-filter: blur(8px);
                            border-radius: 8px;
                            border: 1px solid rgba(0, 240, 255, 0.25);
                            padding: 0.4rem 0.8rem;
                            position: relative;
                        ">
                            <div style="position:relative; width:100%; height:10vh;">
                                <canvas id="tcPedalWave" width="550" height="60" style="width:100%; height:100%; background:rgba(0,0,0,0.25); border-radius:4px;"></canvas>
                                
                                <!-- Top-Right Labels: THROTTLE Top Right, BRAKE Bottom Right -->
                                <span style="position:absolute; top:4px; right:8px; color:#00ff66; font-weight:bold; font-size:0.7rem; font-family:'ForzaGear'; letter-spacing:0.05em; text-shadow:0 0 6px rgba(0,255,102,0.6);">THROTTLE</span>
                                <span style="position:absolute; bottom:4px; right:8px; color:#ff0055; font-weight:bold; font-size:0.7rem; font-family:'ForzaGear'; letter-spacing:0.05em; text-shadow:0 0 6px rgba(255,0,85,0.6);">BRAKE</span>
                            </div>
                        </div>

                    </div>
                </div>
            `;

            this.initialized = true;
        },

        update: function (data, config) {
            if (!this.containerEl) return;

            var fullConfig = config || window._currentFullConfig || {};
            var elements = fullConfig.elements || window._currentHudElements || {};

            if (fullConfig.telemetryScale !== undefined) {
                this.lastScale = fullConfig.telemetryScale;
                try { localStorage.setItem('forza_hud_tele_scale', fullConfig.telemetryScale.toString()); } catch (e) {}
            }
            if (fullConfig.telemetryOpacity !== undefined) {
                this.lastOpacity = fullConfig.telemetryOpacity;
                try { localStorage.setItem('forza_hud_tele_opacity', fullConfig.telemetryOpacity.toString()); } catch (e) {}
            }

            var tScale = this.lastScale;
            var tOpacity = this.lastOpacity;

            var wrapper = document.getElementById('tcClusterWrapper');
            if (wrapper) {
                wrapper.style.opacity = tOpacity;
                wrapper.style.transform = 'translate(-50%, -50%) scale(' + tScale + ')';
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

            var now = performance.now();

            // 1. Center G-Force Radar & Dynamics
            if (showAttitude) {
                var rawAccX = data.accel_x !== undefined ? data.accel_x : (data.AccelerationX || 0);
                var rawAccZ = data.accel_z !== undefined ? data.accel_z : (data.AccelerationZ || 0);
                var lat = rawAccX / 9.81;
                var lon = rawAccZ / 9.81;

                var gCircle = document.getElementById('tcGRadarCircle');
                var dot = document.getElementById('tcGDot');
                if (gCircle && dot) {
                    var radius = gCircle.clientWidth / 2;
                    var normLat = Math.max(-2, Math.min(2, lat)) / 2;
                    var normLon = Math.max(-2, Math.min(2, lon)) / 2;
                    var xPx = normLat * radius;
                    var yPx = normLon * radius;
                    dot.style.transform = 'translate(' + xPx + 'px, ' + yPx + 'px)';
                }

                var latEl = document.getElementById('tcLatG'); if (latEl) latEl.textContent = Math.abs(lat).toFixed(2);
                var lonEl = document.getElementById('tcLonG'); if (lonEl) lonEl.textContent = Math.abs(lon).toFixed(2);

                // Update 30s history & peak markers
                if (this.gHist.length < 900) {
                    this.gHist.push({ lat: lat, lon: lon, time: now });
                } else {
                    var oldG = this.gHist.shift();
                    if (oldG) { oldG.lat = lat; oldG.lon = lon; oldG.time = now; this.gHist.push(oldG); }
                }

                var markersContainer = document.getElementById('tcGMarkers');
                if (markersContainer && gCircle) {
                    var radiusPx = gCircle.clientWidth / 2;
                    var recent30s = this.gHist.filter(function (p) { return now - p.time <= 30000; });
                    if (recent30s.length > 0 && Math.random() < 0.2) {
                        var maxL = 0, maxR = 0, maxB = 0, maxA = 0;
                        recent30s.forEach(function (p) {
                            if (p.lat < maxL) maxL = p.lat;
                            if (p.lat > maxR) maxR = p.lat;
                            if (p.lon < maxB) maxB = p.lon;
                            if (p.lon > maxA) maxA = p.lon;
                        });
                        markersContainer.innerHTML = '';
                        var points = [
                            { lat: maxL, lon: 0 }, { lat: maxR, lon: 0 },
                            { lat: 0, lon: maxB }, { lat: 0, lon: maxA }
                        ];
                        points.forEach(function (p) {
                            var mDot = document.createElement('div');
                            mDot.style.position = 'absolute';
                            mDot.style.width = '6px';
                            mDot.style.height = '6px';
                            mDot.style.borderRadius = '50%';
                            mDot.style.background = 'rgba(255,255,255,0.7)';
                            mDot.style.left = (radiusPx + (p.lat / 2) * radiusPx - 3) + 'px';
                            mDot.style.top = (radiusPx + (p.lon / 2) * radiusPx - 3) + 'px';
                            markersContainer.appendChild(mDot);
                        });
                    }
                }
            }

            // 2. Throttle & Brake 5-Second Input Trace Canvas
            if (showPedals) {
                var throttle = Math.max(0, Math.min(1, data.throttle !== undefined ? data.throttle : 0));
                var brake = Math.max(0, Math.min(1, data.brake !== undefined ? data.brake : 0));

                if (this.pedalHist.length < 300) {
                    this.pedalHist.push({ throttle: throttle, brake: brake, time: now });
                } else {
                    var oldP = this.pedalHist.shift();
                    if (oldP) { oldP.throttle = throttle; oldP.brake = brake; oldP.time = now; this.pedalHist.push(oldP); }
                }

                var pCanvas = document.getElementById('tcPedalWave');
                if (pCanvas && this.pedalHist.length > 0) {
                    var pCtx = pCanvas.getContext('2d');
                    if (pCtx) {
                        var pw = pCanvas.width, ph = pCanvas.height;
                        pCtx.clearRect(0, 0, pw, ph);

                        // 50% Guideline
                        pCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                        pCtx.lineWidth = 1;
                        pCtx.beginPath();
                        pCtx.moveTo(0, ph * 0.5);
                        pCtx.lineTo(pw, ph * 0.5);
                        pCtx.stroke();

                        var len = this.pedalHist.length;
                        var stepX = pw / (300 - 1);

                        // Throttle Trace (Green #00ff66) - Latest data on right
                        pCtx.beginPath();
                        for (var k = 0; k < len; k++) {
                            var px = k * stepX;
                            var py = ph - (this.pedalHist[k].throttle * (ph - 6)) - 3;
                            if (k === 0) pCtx.moveTo(px, py);
                            else pCtx.lineTo(px, py);
                        }
                        pCtx.lineWidth = 2.5;
                        pCtx.strokeStyle = '#00ff66';
                        pCtx.shadowColor = 'rgba(0, 255, 102, 0.6)';
                        pCtx.shadowBlur = 6;
                        pCtx.stroke();
                        pCtx.shadowBlur = 0;

                        // Brake Trace (Red #ff0055) - Latest data on right
                        pCtx.beginPath();
                        for (var k = 0; k < len; k++) {
                            var px = k * stepX;
                            var py = ph - (this.pedalHist[k].brake * (ph - 6)) - 3;
                            if (k === 0) pCtx.moveTo(px, py);
                            else pCtx.lineTo(px, py);
                        }
                        pCtx.lineWidth = 2.5;
                        pCtx.strokeStyle = '#ff0055';
                        pCtx.shadowColor = 'rgba(255, 0, 85, 0.6)';
                        pCtx.shadowBlur = 6;
                        pCtx.stroke();
                        pCtx.shadowBlur = 0;
                    }
                }
            }

            // 3. 4-Corner Tire Radars, Temp 3-Second Distribution Histograms & Suspension Bars
            var rawSlipRatios = data.TireSlipRatio || [];
            var rawSlipAngles = data.TireSlipAngle || [];
            var rawTemps = data.TireTemp || [];
            var rawTravels = data.NormalizedSuspensionTravel || [];

            var slipRatios = [
                data.slip_fl !== undefined ? data.slip_fl : (rawSlipRatios[0] || 0),
                data.slip_fr !== undefined ? data.slip_fr : (rawSlipRatios[1] || 0),
                data.slip_rl !== undefined ? data.slip_rl : (rawSlipRatios[2] || 0),
                data.slip_rr !== undefined ? data.slip_rr : (rawSlipRatios[3] || 0)
            ];
            var slipAngles = [
                data.slip_angle_fl !== undefined ? data.slip_angle_fl : (rawSlipAngles[0] || 0),
                data.slip_angle_fr !== undefined ? data.slip_angle_fr : (rawSlipAngles[1] || 0),
                data.slip_angle_rl !== undefined ? data.slip_angle_rl : (rawSlipAngles[2] || 0),
                data.slip_angle_rr !== undefined ? data.slip_angle_rr : (rawSlipAngles[3] || 0)
            ];
            var temps = [
                rawTemps[0] !== undefined ? rawTemps[0] : (data.temp_fl || 180),
                rawTemps[1] !== undefined ? rawTemps[1] : (data.temp_fr || 180),
                rawTemps[2] !== undefined ? rawTemps[2] : (data.temp_rl || 180),
                rawTemps[3] !== undefined ? rawTemps[3] : (data.temp_rr || 180)
            ];
            var travels = [
                data.susp_fl !== undefined ? data.susp_fl : (rawTravels[0] || 0),
                data.susp_fr !== undefined ? data.susp_fr : (rawTravels[1] || 0),
                data.susp_rl !== undefined ? data.susp_rl : (rawTravels[2] || 0),
                data.susp_rr !== undefined ? data.susp_rr : (rawTravels[3] || 0)
            ];

            // Unit conversion for Tire Temp (°C vs °F)
            var isMetric = (data.isMetric !== undefined ? data.isMetric : (data.is_metric !== false));

            for (var i = 0; i < 4; i++) {
                var tag = corners[i];
                var cRatio = slipRatios[i] || 0;
                var cAngle = slipAngles[i] || 0;
                var cTemp = temps[i] || 180;
                var cTravel = Math.max(0, Math.min(1, travels[i] || 0));

                // Maintain 3-Second Tire Temp History (180 points at 60Hz)
                var tHist = this.tireHist[i];
                if (tHist.length < 180) {
                    tHist.push({ temp: cTemp, time: now });
                } else {
                    var oldT = tHist.shift();
                    if (oldT) { oldT.temp = cTemp; oldT.time = now; tHist.push(oldT); }
                }

                // --- Tire Radars & Text (Only update if showTires is true) ---
                if (showTires) {
                    var angEl = document.getElementById('tcTireAng' + tag); if (angEl) angEl.textContent = (cAngle * (180 / Math.PI)).toFixed(1) + '°';
                    var ratEl = document.getElementById('tcTireRat' + tag); if (ratEl) ratEl.textContent = cRatio.toFixed(2);

                    // Dynamic Temp display with unit (°C or °F)
                    var tempEl = document.getElementById('tcTireTemp' + tag);
                    if (tempEl) {
                        var displayTemp = isMetric ? Math.round(cTemp) : Math.round(cTemp * 1.8 + 32);
                        tempEl.textContent = displayTemp + (isMetric ? '°C' : '°F');
                        tempEl.style.color = getTempColor(cTemp);
                    }

                    // 2D Slip Radar Canvas
                    var rCanvas = document.getElementById('tcTireRadar' + tag);
                    if (rCanvas) {
                        var rCtx = rCanvas.getContext('2d');
                        if (rCtx) {
                            var rw = rCanvas.width, rh = rCanvas.height;
                            rCtx.clearRect(0, 0, rw, rh);
                            var rx0 = rw / 2, ry0 = rh / 2, rRad = rw * 0.4;
                            rCtx.beginPath(); rCtx.arc(rx0, ry0, rRad, 0, Math.PI * 2);
                            rCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; rCtx.lineWidth = 1; rCtx.stroke();
                            var mag = Math.sqrt(cAngle * cAngle + cRatio * cRatio);
                            var px = rx0 + (cAngle / 1.0) * rRad;
                            var py = ry0 - (cRatio / 1.0) * rRad;
                            rCtx.beginPath(); rCtx.arc(px, py, 4, 0, Math.PI * 2);
                            rCtx.fillStyle = mag > 1.0 ? '#ff0055' : '#00f0ff'; rCtx.fill();
                        }
                    }

                    // 3-Second Tire Temp Distribution Histogram Canvas (Same algorithm as Telemetry Tab)
                    var tCanvas = document.getElementById('tcTireHist' + tag);
                    if (tCanvas && tHist.length > 0) {
                        var tCtx = tCanvas.getContext('2d');
                        if (tCtx) {
                            var tw = tCanvas.width, th = tCanvas.height;
                            tCtx.clearRect(0, 0, tw, th);

                            var numBins = 15;
                            var tempMinScale = 100, tempMaxScale = 260;
                            var tempPerBin = (tempMaxScale - tempMinScale) / numBins;
                            var bins = new Array(numBins).fill(0);

                            tHist.forEach(function (p) {
                                var tVal = Math.max(tempMinScale, Math.min(tempMaxScale, p.temp));
                                var bIdx = Math.floor((tVal - tempMinScale) / tempPerBin);
                                if (bIdx >= numBins) bIdx = numBins - 1;
                                bins[bIdx]++;
                            });

                            var maxBinCount = Math.max(1, Math.max.apply(null, bins));
                            var barW = tw / numBins;

                            for (var b = 0; b < numBins; b++) {
                                var bH = (bins[b] / maxBinCount) * (th - 4);
                                if (bH < 2) bH = 2;
                                var bTemp = tempMinScale + b * tempPerBin;
                                tCtx.fillStyle = getTempColor(bTemp);
                                tCtx.fillRect(b * barW, th - bH, barW - 1, bH);
                            }
                        }
                    }
                }

                // --- Suspension Bar & Waveform Canvas (Only update if showSusp is true) ---
                if (showSusp) {
                    var txtEl = document.getElementById('tcSuspText' + tag);
                    if (txtEl) txtEl.textContent = cTravel.toFixed(2);

                    var barEl = document.getElementById('tcSuspBar' + tag);
                    if (barEl) barEl.style.height = (cTravel * 100) + '%';

                    var mm = this.suspMinMax[i];
                    if (mm.min === null || cTravel < mm.min) mm.min = cTravel;
                    if (mm.max === null || cTravel > mm.max) mm.max = cTravel;
                    var minEl = document.getElementById('tcSuspMin' + tag); if (minEl) minEl.textContent = mm.min.toFixed(2);
                    var maxEl = document.getElementById('tcSuspMax' + tag); if (maxEl) maxEl.textContent = mm.max.toFixed(2);

                    var sHist = this.suspHist[i];
                    if (sHist.length < 150) {
                        sHist.push({ travel: cTravel, time: now });
                    } else {
                        var oldS = sHist.shift();
                        if (oldS) { oldS.travel = cTravel; oldS.time = now; sHist.push(oldS); }
                    }

                    var wCanvas = document.getElementById('tcSuspWave' + tag);
                    if (wCanvas && sHist.length > 0) {
                        var wCtx = wCanvas.getContext('2d');
                        if (wCtx) {
                            var ww = wCanvas.width, wh = wCanvas.height;
                            wCtx.clearRect(0, 0, ww, wh);
                            var warnH = wh * 0.05;
                            wCtx.fillStyle = 'rgba(255, 0, 60, 0.2)';
                            wCtx.fillRect(0, 0, ww, warnH);
                            wCtx.fillRect(0, wh - warnH, ww, warnH);

                            wCtx.beginPath();
                            for (var j = 0; j < sHist.length; j++) {
                                var wx = (j / 150) * ww;
                                var wy = wh - (sHist[j].travel * wh);
                                if (j === 0) wCtx.moveTo(wx, wy);
                                else wCtx.lineTo(wx, wy);
                            }
                            wCtx.strokeStyle = '#00f0ff';
                            wCtx.lineWidth = 1.5;
                            wCtx.stroke();
                        }
                    }
                }
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

    window.TelemetryCardsManager = TelemetryCardsManager;

})(window);
