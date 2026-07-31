// =============================================================================
// hud_overlay/shared/telemetry-cards/template.js
// HTML Layout template string generator for Central Telemetry Cluster
// =============================================================================

/**
 * Generates the full cluster HTML string.
 *
 * @param {number} initialScale   - Legacy scale fallback
 * @param {number} initialOpacity - Wrapper opacity (0??)
 */
export function getClusterHTML(initialScale, initialOpacity) {
    return `
        <style>
            /* ---- Telemetry Cluster CSS Variables ---- */
            #tcClusterWrapper {
                --card-primary:        #00f0ff;
                --card-contrast:       #ff0088;
                --card-font-size:      calc(0.9375rem * var(--tc-font-scale, 1.0));
                --card-font-sm:        calc(0.8125rem * var(--tc-font-scale, 1.0));
                --tc-corner-offset-y:  0px;
                --tc-corners-scale:    1.0;
                --tc-gradar-scale:     1.0;
            }

            /* Responsive breakpoints */
            .tc-radar-container { width: 70vh; height: 70vh; }
            .tc-sub-card        { width: 13.5vh; min-height: 12vh; }
            .tc-sub-canvas      { width: 100%; }
            .tc-edge-chart      { width: 75vh; height: 11vh; }

            @media (min-width: 1440px) {
                .tc-radar-container { width: 68vh; height: 68vh; }
                .tc-sub-card        { width: 13vh; min-height: 11.5vh; }
                .tc-edge-chart      { width: 72vh; height: 10.5vh; }
            }

            @media (min-width: 3840px) {
                .tc-radar-container { width: 64vh; height: 64vh; }
                .tc-sub-card        { width: 12.5vh; min-height: 11vh; }
                .tc-edge-chart      { width: 68vh; height: 10vh; }
            }

            /* Corner card container */
            .tele-corner {
                background: rgba(0, 0, 0, 0.4);
                backdrop-filter: blur(8px);
                padding: 0.5rem 0.6rem;
                border-radius: 8px;
                border: 1px solid var(--card-primary, rgba(0, 240, 255, 0.25));
                box-sizing: border-box;
                transform: translateY(var(--tc-corner-offset-y, 0px)) scale(var(--tc-corners-scale, 1.0));
                transition: transform 0.15s ease-out;
            }

            /* Uniform sub-cards inside corner: [SUSP] [SLIP] [TEMP] */
            .tc-sub-card {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-between;
                background: rgba(0, 0, 0, 0.25);
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                padding: 0.35rem 0.4rem;
                box-sizing: border-box;
                flex: 1;
            }

            .tc-sub-header {
                width: 100%;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: var(--card-font-sm, 0.65rem);
                color: var(--card-primary, #00f0ff);
                font-weight: bold;
            }

            .tc-sub-footer {
                width: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 4px;
                font-size: calc(var(--card-font-sm, 0.65rem) * 0.9);
                font-family: monospace;
                color: #aaa;
                white-space: nowrap;
            }

            /* Edge Charts Panels */
            .tc-edge-chart-panel {
                display: flex;
                flex-direction: column;
                align-items: center;
                background: rgba(0, 0, 0, 0.45);
                backdrop-filter: blur(8px);
                border-radius: 8px;
                border: 1px solid var(--card-primary, rgba(0, 240, 255, 0.3));
                padding: 0.4rem 0.8rem;
                box-sizing: border-box;
                pointer-events: none;
                transition: transform 0.15s ease-out;
            }

            /* Reference Grid Lines Overlay */
            .tc-grid-lines {
                position: absolute;
                inset: -20vh;
                pointer-events: none;
                z-index: 1;
                display: none;
            }
            .tc-grid-lines::before {
                content: '';
                position: absolute;
                top: 50%; left: 0; right: 0;
                height: 1px;
                background: linear-gradient(90deg, transparent, rgba(0, 240, 255, 0.4) 20%, rgba(0, 240, 255, 0.4) 80%, transparent);
            }
            .tc-grid-lines::after {
                content: '';
                position: absolute;
                left: 50%; top: 0; bottom: 0;
                width: 1px;
                background: linear-gradient(180deg, transparent, rgba(0, 240, 255, 0.4) 20%, rgba(0, 240, 255, 0.4) 80%, transparent);
            }

            /* Corner cards edge snap layout */
            #tcGridContainer.tc-edge-snapped-corners {
                width: 100vw;
                box-sizing: border-box;
                padding: 0 25px;
                grid-template-columns: auto 1fr auto !important;
            }

            /* Side-by-side half-width edge containers & charts */
            #tcTopEdgeContainer.tc-side-by-side,
            #tcBottomEdgeContainer.tc-side-by-side {
                flex-direction: row !important;
                justify-content: center !important;
                gap: 1.5vh !important;
                width: 100vw !important;
                box-sizing: border-box;
                padding: 0 25px;
            }


            .tc-edge-chart.tc-half-width {
                width: 36vh !important;
            }
            @media (min-width: 1440px) {
                .tc-edge-chart.tc-half-width { width: 35vh !important; }
            }
            @media (min-width: 3840px) {
                .tc-edge-chart.tc-half-width { width: 33vh !important; }
            }

            /* Readout chips on G-radar */
            .tc-g-chip {
                position: absolute;
                background: rgba(0, 0, 0, 0.65);
                backdrop-filter: blur(6px);
                padding: 0.35rem 0.7rem;
                border-radius: 12px;
                display: flex;
                flex-direction: column;
                align-items: center;
                font-family: 'ForzaGear', Arial, sans-serif;
                z-index: 10;
            }
        </style>

        <div id="tcClusterWrapper" class="tele-cluster-wrapper" style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            pointer-events: none;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 999;
            opacity: ${initialOpacity};
            transition: opacity 0.2s ease;
        ">
            <!-- Reference Grid Lines -->
            <div id="tcGridLines" class="tc-grid-lines"></div>

            <!-- Core 3x3 Grid Layout -->
            <div id="tcGridContainer" style="
                display: grid;
                grid-template-columns: auto auto auto;
                column-gap: 2.5vw;
                row-gap: 2.0vh;
                align-items: center;
                justify-items: center;
                position: relative;
            ">

                <!-- Row 1, Col 1: FL Corner -->
                <div id="tcCornerFL" class="tele-corner" style="
                    grid-column: 1; grid-row: 1;
                    display: flex; flex-direction: column; gap: 0.4rem;
                    transform-origin: bottom right;
                ">
                    <div style="font-size:var(--card-font-size,0.75rem); color:var(--card-primary,#00f0ff); font-weight:bold; letter-spacing:0.05em;">FL</div>
                    <div style="display:flex; flex-direction:row; gap:0.4rem; align-items:stretch;">
                        <div id="tcSuspBlockFL" class="tc-sub-card">
                            <div class="tc-sub-header">
                                <span>SUSP</span>
                                <span id="tcSuspTextFL" style="color:#fff; font-family:monospace;">0.00</span>
                            </div>
                            <div style="display:flex; flex-direction:row; gap:4px; align-items:center; justify-content:center; flex:1; width:100%;">
                                <div style="position:relative; width:8px; height:10.5vh; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden; border:1px solid rgba(255,255,255,0.15); flex-shrink:0;">
                                    <div id="tcSuspBarFL" style="position:absolute; bottom:0; left:0; right:0; height:50%; background:var(--card-primary,#00f0ff);"></div>
                                </div>
                                <canvas id="tcSuspWaveFL" width="130" height="90" class="tc-sub-canvas" style="width:100%; height:10.5vh; border-radius:4px; background:rgba(0,0,0,0.2);"></canvas>
                            </div>
                            <div class="tc-sub-footer">
                                <span>Mn:<span id="tcSuspMinFL" style="color:#fff;">0.00</span></span>
                                <span>Mx:<span id="tcSuspMaxFL" style="color:#fff;">0.00</span></span>
                            </div>
                        </div>
                        <div id="tcSlipBlockFL" class="tc-sub-card">
                            <div class="tc-sub-header">
                                <span>SLIP</span>
                                <span style="font-family:monospace; color:#aaa; font-size:calc(var(--card-font-sm, 0.65rem) * 0.9); white-space:nowrap;">
                                    A:<span id="tcTireAngFL" style="color:#fff;">0.0簞</span> R:<span id="tcTireRatFL" style="color:#fff;">0.00</span>
                                </span>
                            </div>
                            <div style="display:flex; align-items:center; justify-content:center; flex:1; width:100%;">
                                <canvas id="tcTireRadarFL" width="400" height="400" class="tc-sub-canvas" style="aspect-ratio:1/1; height:10.5vh; max-width:100%;"></canvas>
                            </div>
                        </div>
                    </div>
                    <div id="tcTempBlockFL" class="tc-sub-card" style="width:100%;">
                        <div class="tc-sub-header">
                            <span>TEMP</span>
                            <span id="tcTireTempFL" style="color:#fff; font-family:monospace;">--簞C</span>
                        </div>
                        <div style="position:relative; width:100%; height:5vh; display:flex; align-items:center; justify-content:center; flex:1; margin:2px 0;">
                            <canvas id="tcTireHistFL" width="800" height="120" style="width:100%; height:5vh; background:rgba(255,255,255,0.03); border-radius:4px;"></canvas>
                        </div>
                        <div class="tc-sub-footer" style="justify-content:space-between;">
                            <span style="font-size:0.55rem; color:#888;">COLD</span>
                            <span style="font-size:0.55rem; color:#888;">HOT</span>
                        </div>
                    </div>
                </div>

                <!-- Row 1, Col 3: FR Corner -->
                <div id="tcCornerFR" class="tele-corner" style="
                    grid-column: 3; grid-row: 1;
                    display: flex; flex-direction: column; gap: 0.4rem;
                    transform-origin: bottom left;
                ">
                    <div style="font-size:var(--card-font-size,0.75rem); color:var(--card-primary,#00f0ff); font-weight:bold; letter-spacing:0.05em; text-align:right;">FR</div>
                    <div style="display:flex; flex-direction:row-reverse; gap:0.4rem; align-items:stretch;">
                        <div id="tcSuspBlockFR" class="tc-sub-card">
                            <div class="tc-sub-header">
                                <span>SUSP</span>
                                <span id="tcSuspTextFR" style="color:#fff; font-family:monospace;">0.00</span>
                            </div>
                            <div style="display:flex; flex-direction:row-reverse; gap:4px; align-items:center; justify-content:center; flex:1; width:100%;">
                                <div style="position:relative; width:8px; height:10.5vh; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden; border:1px solid rgba(255,255,255,0.15); flex-shrink:0;">
                                    <div id="tcSuspBarFR" style="position:absolute; bottom:0; left:0; right:0; height:50%; background:var(--card-primary,#00f0ff);"></div>
                                </div>
                                <canvas id="tcSuspWaveFR" width="130" height="90" class="tc-sub-canvas" style="width:100%; height:10.5vh; border-radius:4px; background:rgba(0,0,0,0.2);"></canvas>
                            </div>
                            <div class="tc-sub-footer">
                                <span>Mn:<span id="tcSuspMinFR" style="color:#fff;">0.00</span></span>
                                <span>Mx:<span id="tcSuspMaxFR" style="color:#fff;">0.00</span></span>
                            </div>
                        </div>
                        <div id="tcSlipBlockFR" class="tc-sub-card">
                            <div class="tc-sub-header">
                                <span>SLIP</span>
                                <span style="font-family:monospace; color:#aaa; font-size:calc(var(--card-font-sm, 0.65rem) * 0.9); white-space:nowrap;">
                                    A:<span id="tcTireAngFR" style="color:#fff;">0.0簞</span> R:<span id="tcTireRatFR" style="color:#fff;">0.00</span>
                                </span>
                            </div>
                            <div style="display:flex; align-items:center; justify-content:center; flex:1; width:100%;">
                                <canvas id="tcTireRadarFR" width="400" height="400" class="tc-sub-canvas" style="aspect-ratio:1/1; height:10.5vh; max-width:100%;"></canvas>
                            </div>
                        </div>
                    </div>
                    <div id="tcTempBlockFR" class="tc-sub-card" style="width:100%;">
                        <div class="tc-sub-header">
                            <span>TEMP</span>
                            <span id="tcTireTempFR" style="color:#fff; font-family:monospace;">--簞C</span>
                        </div>
                        <div style="position:relative; width:100%; height:5vh; display:flex; align-items:center; justify-content:center; flex:1; margin:2px 0;">
                            <canvas id="tcTireHistFR" width="800" height="120" style="width:100%; height:5vh; background:rgba(255,255,255,0.03); border-radius:4px;"></canvas>
                        </div>
                        <div class="tc-sub-footer" style="justify-content:space-between;">
                            <span style="font-size:0.55rem; color:#888;">COLD</span>
                            <span style="font-size:0.55rem; color:#888;">HOT</span>
                        </div>
                    </div>
                </div>

                <!-- Row 1-3, Col 2: Central Anchor Container -->
                <div id="tcCenterAnchor" class="tc-radar-container" style="
                    grid-column: 2; grid-row: 1 / span 3;
                    display: flex; flex-direction: column;
                    align-items: center; justify-content: center;
                    position: relative;
                    border: 1px dashed rgba(0, 240, 255, 0.15);
                    border-radius: 50%;
                    box-sizing: border-box;
                    transform: scale(var(--tc-gradar-scale, 1.0));
                    transition: transform 0.15s ease-out;
                ">
                    <div id="tcCenterRadarContainer" style="
                        width: 100%; height: 100%;
                        display: flex; flex-direction: column;
                        align-items: center; justify-content: center;
                        position: relative;
                    ">
                        <div id="tcGRadarCircle" style="
                            position: relative;
                            width: 100%; height: 100%;
                            border-radius: 50%;
                            background: rgba(0, 0, 0, 0.25);
                            backdrop-filter: blur(8px);
                            border: 2px solid var(--card-primary, rgba(0, 240, 255, 0.35));
                            box-shadow: 0 0 25px rgba(0, 240, 255, 0.15), inset 0 0 25px rgba(0, 0, 0, 0.5);
                            display: flex; justify-content: center; align-items: center;
                        ">
                            <div style="position:absolute; width:50%; height:50%; border-radius:50%; border:1.5px dashed rgba(0, 240, 255, 0.25);"></div>
                            <div style="position:absolute; width:25%; height:25%; border-radius:50%; border:1px dashed rgba(255, 255, 255, 0.15);"></div>
                            <div style="position:absolute; width:100%; height:1px; background:rgba(255,255,255,0.2);"></div>
                            <div style="position:absolute; width:1px; height:100%; background:rgba(255,255,255,0.2);"></div>

                            <span style="position:absolute; top:8px; font-size:var(--card-font-size,0.8rem); color:rgba(255,255,255,0.6); font-weight:bold; letter-spacing:1px;">BRAKE</span>
                            <span style="position:absolute; bottom:8px; font-size:var(--card-font-size,0.8rem); color:rgba(255,255,255,0.6); font-weight:bold; letter-spacing:1px;">ACCEL</span>
                            <span style="position:absolute; left:12px; font-size:var(--card-font-size,0.8rem); color:rgba(255,255,255,0.6); font-weight:bold;">L</span>
                            <span style="position:absolute; right:12px; font-size:var(--card-font-size,0.8rem); color:rgba(255,255,255,0.6); font-weight:bold;">R</span>

                            <div id="tcLatGChip" class="tc-g-chip" style="
                                left: -18px; top: 50%;
                                transform: translateY(-50%);
                                border: 1px solid var(--card-primary, rgba(0, 240, 255, 0.4));
                                box-shadow: 0 0 12px rgba(0, 240, 255, 0.2);
                            ">
                                <span style="font-size:var(--card-font-sm,0.65rem); color:#aaa; letter-spacing:1px;">LAT G</span>
                                <strong id="tcLatG" style="font-size:1.1rem; color:var(--card-primary,#00f0ff);">0.00</strong>
                            </div>

                            <div id="tcLonGChip" class="tc-g-chip" style="
                                bottom: -18px; left: 50%;
                                transform: translateX(-50%);
                                border: 1px solid var(--card-contrast, rgba(255, 0, 136, 0.4));
                                box-shadow: 0 0 12px rgba(255, 0, 136, 0.2);
                            ">
                                <span style="font-size:var(--card-font-sm,0.65rem); color:#aaa; letter-spacing:1px;">LON G</span>
                                <strong id="tcLonG" style="font-size:1.1rem; color:var(--card-contrast,#ff0088);">0.00</strong>
                            </div>

                            <div id="tcGMarkers" style="position:absolute; inset:0; pointer-events:none;"></div>

                            <div id="tcGDot" style="
                                position: absolute; width: 18px; height: 18px;
                                background-color: var(--card-primary, #00f0ff);
                                border-radius: 50%;
                                box-shadow: 0 0 16px var(--card-primary, #00f0ff), 0 0 30px rgba(0, 240, 255, 0.8);
                                transition: transform 0.05s linear;
                                transform: translate(0px, 0px);
                            "></div>
                        </div>
                    </div>
                </div>

                <!-- Row 3, Col 1: RL Corner -->
                <div id="tcCornerRL" class="tele-corner" style="
                    grid-column: 1; grid-row: 3;
                    display: flex; flex-direction: column; gap: 0.4rem;
                    transform-origin: top right;
                ">
                    <div style="font-size:var(--card-font-size,0.75rem); color:var(--card-primary,#00f0ff); font-weight:bold; letter-spacing:0.05em;">RL</div>
                    <div style="display:flex; flex-direction:row; gap:0.4rem; align-items:stretch;">
                        <div id="tcSuspBlockRL" class="tc-sub-card">
                            <div class="tc-sub-header">
                                <span>SUSP</span>
                                <span id="tcSuspTextRL" style="color:#fff; font-family:monospace;">0.00</span>
                            </div>
                            <div style="display:flex; flex-direction:row; gap:4px; align-items:center; justify-content:center; flex:1; width:100%;">
                                <div style="position:relative; width:8px; height:10.5vh; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden; border:1px solid rgba(255,255,255,0.15); flex-shrink:0;">
                                    <div id="tcSuspBarRL" style="position:absolute; bottom:0; left:0; right:0; height:50%; background:var(--card-primary,#00f0ff);"></div>
                                </div>
                                <canvas id="tcSuspWaveRL" width="130" height="90" class="tc-sub-canvas" style="width:100%; height:10.5vh; border-radius:4px; background:rgba(0,0,0,0.2);"></canvas>
                            </div>
                            <div class="tc-sub-footer">
                                <span>Mn:<span id="tcSuspMinRL" style="color:#fff;">0.00</span></span>
                                <span>Mx:<span id="tcSuspMaxRL" style="color:#fff;">0.00</span></span>
                            </div>
                        </div>
                        <div id="tcSlipBlockRL" class="tc-sub-card">
                            <div class="tc-sub-header">
                                <span>SLIP</span>
                                <span style="font-family:monospace; color:#aaa; font-size:calc(var(--card-font-sm, 0.65rem) * 0.9); white-space:nowrap;">
                                    A:<span id="tcTireAngRL" style="color:#fff;">0.0簞</span> R:<span id="tcTireRatRL" style="color:#fff;">0.00</span>
                                </span>
                            </div>
                            <div style="display:flex; align-items:center; justify-content:center; flex:1; width:100%;">
                                <canvas id="tcTireRadarRL" width="400" height="400" class="tc-sub-canvas" style="aspect-ratio:1/1; height:10.5vh; max-width:100%;"></canvas>
                            </div>
                        </div>
                    </div>
                    <div id="tcTempBlockRL" class="tc-sub-card" style="width:100%;">
                        <div class="tc-sub-header">
                            <span>TEMP</span>
                            <span id="tcTireTempRL" style="color:#fff; font-family:monospace;">--簞C</span>
                        </div>
                        <div style="position:relative; width:100%; height:5vh; display:flex; align-items:center; justify-content:center; flex:1; margin:2px 0;">
                            <canvas id="tcTireHistRL" width="800" height="120" style="width:100%; height:5vh; background:rgba(255,255,255,0.03); border-radius:4px;"></canvas>
                        </div>
                        <div class="tc-sub-footer" style="justify-content:space-between;">
                            <span style="font-size:0.55rem; color:#888;">COLD</span>
                            <span style="font-size:0.55rem; color:#888;">HOT</span>
                        </div>
                    </div>
                </div>

                <!-- Row 3, Col 3: RR Corner -->
                <div id="tcCornerRR" class="tele-corner" style="
                    grid-column: 3; grid-row: 3;
                    display: flex; flex-direction: column; gap: 0.4rem;
                    transform-origin: top left;
                ">
                    <div style="font-size:var(--card-font-size,0.75rem); color:var(--card-primary,#00f0ff); font-weight:bold; letter-spacing:0.05em; text-align:right;">RR</div>
                    <div style="display:flex; flex-direction:row-reverse; gap:0.4rem; align-items:stretch;">
                        <div id="tcSuspBlockRR" class="tc-sub-card">
                            <div class="tc-sub-header">
                                <span>SUSP</span>
                                <span id="tcSuspTextRR" style="color:#fff; font-family:monospace;">0.00</span>
                            </div>
                            <div style="display:flex; flex-direction:row-reverse; gap:4px; align-items:center; justify-content:center; flex:1; width:100%;">
                                <div style="position:relative; width:8px; height:10.5vh; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden; border:1px solid rgba(255,255,255,0.15); flex-shrink:0;">
                                    <div id="tcSuspBarRR" style="position:absolute; bottom:0; left:0; right:0; height:50%; background:var(--card-primary,#00f0ff);"></div>
                                </div>
                                <canvas id="tcSuspWaveRR" width="130" height="90" class="tc-sub-canvas" style="width:100%; height:10.5vh; border-radius:4px; background:rgba(0,0,0,0.2);"></canvas>
                            </div>
                            <div class="tc-sub-footer">
                                <span>Mn:<span id="tcSuspMinRR" style="color:#fff;">0.00</span></span>
                                <span>Mx:<span id="tcSuspMaxRR" style="color:#fff;">0.00</span></span>
                            </div>
                        </div>
                        <div id="tcSlipBlockRR" class="tc-sub-card">
                            <div class="tc-sub-header">
                                <span>SLIP</span>
                                <span style="font-family:monospace; color:#aaa; font-size:calc(var(--card-font-sm, 0.65rem) * 0.9); white-space:nowrap;">
                                    A:<span id="tcTireAngRR" style="color:#fff;">0.0簞</span> R:<span id="tcTireRatRR" style="color:#fff;">0.00</span>
                                </span>
                            </div>
                            <div style="display:flex; align-items:center; justify-content:center; flex:1; width:100%;">
                                <canvas id="tcTireRadarRR" width="400" height="400" class="tc-sub-canvas" style="aspect-ratio:1/1; height:10.5vh; max-width:100%;"></canvas>
                            </div>
                        </div>
                    </div>
                    <div id="tcTempBlockRR" class="tc-sub-card" style="width:100%;">
                        <div class="tc-sub-header">
                            <span>TEMP</span>
                            <span id="tcTireTempRR" style="color:#fff; font-family:monospace;">--簞C</span>
                        </div>
                        <div style="position:relative; width:100%; height:5vh; display:flex; align-items:center; justify-content:center; flex:1; margin:2px 0;">
                            <canvas id="tcTireHistRR" width="800" height="120" style="width:100%; height:5vh; background:rgba(255,255,255,0.03); border-radius:4px;"></canvas>
                        </div>
                        <div class="tc-sub-footer" style="justify-content:space-between;">
                            <span style="font-size:0.55rem; color:#888;">COLD</span>
                            <span style="font-size:0.55rem; color:#888;">HOT</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>

        <!-- ?????????????????????????????????????????????? -->
        <!-- Fixed Screen Top / Bottom Flex Containers      -->
        <!-- ?????????????????????????????????????????????? -->
        <div id="tcTopEdgeContainer" style="
            position: fixed; top: 15px; left: 0; right: 0;
            display: flex; flex-direction: column; align-items: center; gap: 10px;
            pointer-events: none; z-index: 1000;
        ">
            <!-- Charts appended here dynamically when positioned TOP -->
        </div>

        <div id="tcBottomEdgeContainer" style="
            position: fixed; bottom: 15px; left: 0; right: 0;
            display: flex; flex-direction: column-reverse; align-items: center; gap: 10px;
            pointer-events: none; z-index: 1000;
        ">
            <!-- Charts appended here dynamically when positioned BOTTOM -->
            <div id="tcPedalWaveContainer" class="tc-edge-chart tc-edge-chart-panel">
                <div style="position:relative; width:100%; height:100%;">
                    <canvas id="tcPedalWave" width="550" height="60" style="width:100%; height:100%; background:rgba(0,0,0,0.25); border-radius:4px;"></canvas>
                    <span style="position:absolute; top:4px; right:8px; color:#00ff66; font-weight:bold; font-size:var(--card-font-sm,0.7rem); font-family:'ForzaGear'; letter-spacing:0.05em; text-shadow:0 0 6px rgba(0,255,102,0.6);">THROTTLE</span>
                    <span style="position:absolute; bottom:4px; right:8px; color:#ff0055; font-weight:bold; font-size:var(--card-font-sm,0.7rem); font-family:'ForzaGear'; letter-spacing:0.05em; text-shadow:0 0 6px rgba(255,0,85,0.6);">BRAKE</span>
                </div>
            </div>

            <div id="tcPowerTorqueContainer" class="tc-edge-chart tc-edge-chart-panel">
                <div style="position:relative; width:100%; height:100%;">
                    <canvas id="tcPowerTorqueChart" width="550" height="80" style="width:100%; height:100%; background:rgba(0,0,0,0.25); border-radius:4px;"></canvas>
                    <span style="position:absolute; top:4px; left:8px; color:#ffeb3b; font-weight:bold; font-size:var(--card-font-sm,0.7rem); font-family:'ForzaGear'; letter-spacing:0.05em; text-shadow:0 0 6px rgba(255,235,59,0.6);">TORQUE</span>
                    <span style="position:absolute; top:4px; right:8px; color:#ff0088; font-weight:bold; font-size:var(--card-font-sm,0.7rem); font-family:'ForzaGear'; letter-spacing:0.05em; text-shadow:0 0 6px rgba(255,0,136,0.6);">POWER</span>
                    <span style="position:absolute; bottom:4px; right:8px; color:#aaa; font-weight:bold; font-size:var(--card-font-sm,0.7rem); font-family:'ForzaGear'; letter-spacing:0.05em;">RPM</span>
                </div>
            </div>
        </div>
    `;
}


