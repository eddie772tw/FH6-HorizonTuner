// =============================================================================
// hud_overlay/shared/telemetry-cards/template.js
// HTML Layout template string generator for Central Telemetry Cluster
// =============================================================================

export function getClusterHTML(initialScale, initialOpacity) {
    return `
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
                column-gap: 2.5vw;
                row-gap: 1.5vh;
                align-items: center;
                justify-items: center;
            ">

                <!-- Row 1, Col 2: Top Power Spacer (Mirrors Row 7) -->
                <div id="tcTopPowerSpacer" style="
                    grid-column: 2;
                    grid-row: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    width: 75vh;
                    margin-bottom: 1.2vh;
                    padding: 0.4rem 0.8rem;
                    border: 1px solid transparent;
                    visibility: hidden;
                ">
                    <div style="width:100%; height:12vh;"></div>
                </div>

                <!-- Row 2, Col 2: Top Pedal Spacer (Mirrors Row 6) -->
                <div id="tcTopPedalSpacer" style="
                    grid-column: 2;
                    grid-row: 2;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    width: 75vh;
                    margin-bottom: 1.2vh;
                    padding: 0.4rem 0.8rem;
                    border: 1px solid transparent;
                    visibility: hidden;
                ">
                    <div style="width:100%; height:10vh;"></div>
                </div>

                <!-- Row 3, Col 1: FL Corner (Front Left - Vertical Layout) -->
                <div id="tcCornerFL" class="tele-corner" style="grid-column:1; grid-row:3; display:flex; flex-direction:column; gap:0.5rem; align-items:flex-start; background:rgba(0,0,0,0.35); backdrop-filter:blur(6px); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid rgba(0,240,255,0.2); transform: scale(var(--tc-elem-scale, 1.0)); transform-origin: top left;">
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

                <!-- Row 3, Col 3: FR Corner (Front Right - Vertical & Symmetric) -->
                <div id="tcCornerFR" class="tele-corner" style="grid-column:3; grid-row:3; display:flex; flex-direction:column; gap:0.5rem; align-items:flex-end; background:rgba(0,0,0,0.35); backdrop-filter:blur(6px); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid rgba(0,240,255,0.2); transform: scale(var(--tc-elem-scale, 1.0)); transform-origin: top right;">
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

                <!-- Row 3, Col 2: Center Core (G-Force Radar: 75vh at 100% scale) -->
                <div id="tcCenterRadarContainer" style="
                    grid-column: 2;
                    grid-row: 3 / span 3;
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
                        <div id="tcLatGChip" style="
                            position: absolute;
                            left: -18px;
                            top: 50%;
                            transform: translateY(-50%) scale(var(--tc-elem-scale, 1.0));
                            transform-origin: left center;
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
                        <div id="tcLonGChip" style="
                            position: absolute;
                            bottom: -18px;
                            left: 50%;
                            transform: translateX(-50%) scale(var(--tc-elem-scale, 1.0));
                            transform-origin: bottom center;
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

                <!-- Row 5, Col 1: RL Corner (Rear Left - Vertical Layout) -->
                <div id="tcCornerRL" class="tele-corner" style="grid-column:1; grid-row:5; display:flex; flex-direction:column; gap:0.5rem; align-items:flex-start; background:rgba(0,0,0,0.35); backdrop-filter:blur(6px); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid rgba(0,240,255,0.2); transform: scale(var(--tc-elem-scale, 1.0)); transform-origin: bottom left;">
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

                <!-- Row 5, Col 3: RR Corner (Rear Right - Vertical & Symmetric) -->
                <div id="tcCornerRR" class="tele-corner" style="grid-column:3; grid-row:5; display:flex; flex-direction:column; gap:0.5rem; align-items:flex-end; background:rgba(0,0,0,0.35); backdrop-filter:blur(6px); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid rgba(0,240,255,0.2); transform: scale(var(--tc-elem-scale, 1.0)); transform-origin: bottom right;">
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
                    grid-row: 6;
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
                    transform: scale(var(--tc-elem-scale, 1.0));
                    transform-origin: top center;
                ">
                    <div style="position:relative; width:100%; height:10vh;">
                        <canvas id="tcPedalWave" width="550" height="60" style="width:100%; height:100%; background:rgba(0,0,0,0.25); border-radius:4px;"></canvas>
                        
                        <!-- Top-Right Labels: THROTTLE Top Right, BRAKE Bottom Right -->
                        <span style="position:absolute; top:4px; right:8px; color:#00ff66; font-weight:bold; font-size:0.7rem; font-family:'ForzaGear'; letter-spacing:0.05em; text-shadow:0 0 6px rgba(0,255,102,0.6);">THROTTLE</span>
                        <span style="position:absolute; bottom:4px; right:8px; color:#ff0055; font-weight:bold; font-size:0.7rem; font-family:'ForzaGear'; letter-spacing:0.05em; text-shadow:0 0 6px rgba(255,0,85,0.6);">BRAKE</span>
                    </div>
                </div>

                <!-- Row 5, Col 2: Power & Torque 2D Scatter Plot -->
                <div id="tcPowerTorqueContainer" style="
                    grid-column: 2;
                    grid-row: 7;
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
                    transform: scale(var(--tc-elem-scale, 1.0));
                    transform-origin: top center;
                ">
                    <div style="position:relative; width:100%; height:12vh;">
                        <canvas id="tcPowerTorqueChart" width="550" height="80" style="width:100%; height:100%; background:rgba(0,0,0,0.25); border-radius:4px;"></canvas>
                        <span id="tcTorqueLabel" style="position:absolute; top:4px; left:8px; color:#ffeb3b; font-weight:bold; font-size:0.7rem; font-family:'ForzaGear'; letter-spacing:0.05em; text-shadow:0 0 6px rgba(255,235,59,0.6);">TORQUE</span>
                        <span id="tcPowerLabel" style="position:absolute; top:4px; right:8px; color:#ff0088; font-weight:bold; font-size:0.7rem; font-family:'ForzaGear'; letter-spacing:0.05em; text-shadow:0 0 6px rgba(255,0,136,0.6);">POWER</span>
                        <span style="position:absolute; bottom:4px; right:8px; color:#aaa; font-weight:bold; font-size:0.7rem; font-family:'ForzaGear'; letter-spacing:0.05em;">RPM</span>
                    </div>
                </div>

            </div>
        </div>
    `;
}
