/**
 * telemetry-cards.js — Shared Telemetry Cards Module
 * Enhanced Vertical Suspension Bars, Clean Tire Radars, Stacked G-Force Values
 */

(function (window) {
    'use strict';

    function getTempColor(temp) {
        if (temp < 150) return '#0088ff';
        if (temp > 210) return '#ff0000';
        return '#00ff00';
    }

    var TelemetryCardsManager = {
        initialized: false,
        containerEl: null,

        // Suspension history
        suspHist: [[], [], [], []],

        init: function (parentEl) {
            if (!parentEl) return;
            this.containerEl = parentEl;

            parentEl.innerHTML = `
                <div class="tele-cards-wrapper" style="display:flex; flex-direction:column-reverse; align-items:flex-end; gap:10px; pointer-events:none;">

                    <!-- Card 3: G-Force & Attitude (Stacked Vertical Values) -->
                    <div class="tele-card" id="tcCardAttitude" style="display:none; width:300px;">
                        <div class="tele-card-title">🌐 G-Force Radar & Dynamics</div>
                        <div style="display:flex; gap:16px; align-items:center; justify-content:space-between;">
                            <!-- 2D G-Force Radar Circle -->
                            <div style="position:relative; width:100px; height:100px; border-radius:50%; background:rgba(255,255,255,0.05); border:2px solid rgba(255,255,255,0.2); display:flex; justify-content:center; align-items:center; flex-shrink:0;">
                                <div style="position:absolute; width:50px; height:50px; border-radius:50%; border:1px dashed rgba(255,255,255,0.15);"></div>
                                <div style="position:absolute; width:100%; height:1px; background:rgba(255,255,255,0.15);"></div>
                                <div style="position:absolute; width:1px; height:100%; background:rgba(255,255,255,0.15);"></div>
                                <span style="position:absolute; top:2px; font-size:8px; color:rgba(255,255,255,0.5); font-weight:600;">BRAKE</span>
                                <span style="position:absolute; bottom:2px; font-size:8px; color:rgba(255,255,255,0.5); font-weight:600;">ACCEL</span>
                                <span style="position:absolute; left:3px; font-size:8px; color:rgba(255,255,255,0.5); font-weight:600;">L</span>
                                <span style="position:absolute; right:3px; font-size:8px; color:rgba(255,255,255,0.5); font-weight:600;">R</span>
                                
                                <div id="tcGDot" style="position:absolute; width:10px; height:10px; background-color:#00f0ff; border-radius:50%; box-shadow:0 0 10px #00f0ff; transition:transform 0.05s linear;"></div>
                            </div>

                            <!-- Stacked Vertical Values (New Lines) -->
                            <div style="flex:1; display:flex; flex-direction:column; gap:6px; font-size:13px; font-family:'ForzaGear', Arial, sans-serif;">
                                <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:2px;">
                                    <span style="color:#aaa;">Lat G:</span>
                                    <strong id="tcLatG" style="color:#00f0ff;">0.00</strong>
                                </div>
                                <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:2px;">
                                    <span style="color:#aaa;">Lon G:</span>
                                    <strong id="tcLonG" style="color:#ff0088;">0.00</strong>
                                </div>
                                <div style="display:flex; justify-content:space-between;">
                                    <span style="color:#aaa;">Accel Z:</span>
                                    <span id="tcAccelZ" style="color:#fff; font-weight:bold;">1.00G</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Card 2: Tire Radar & Temp (Pure Visuals: Radars & Histograms Only, No Text Values) -->
                    <div class="tele-card" id="tcCardTires" style="display:none; width:300px;">
                        <div class="tele-card-title">🛞 Tire Radars & Temp Histograms</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                            <!-- FL Tire -->
                            <div style="background:rgba(0,0,0,0.3); padding:6px; border-radius:4px; display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <div style="font-size:10px; font-weight:bold; color:#00f0ff;">FL</div>
                                <div style="display:flex; gap:6px; align-items:center;">
                                    <canvas id="tcTireRadarFL" width="55" height="55" style="width:55px; height:55px;"></canvas>
                                    <canvas id="tcTireHistFL" width="45" height="45" style="width:45px; height:45px; background:rgba(255,255,255,0.03); border-radius:3px;"></canvas>
                                </div>
                            </div>
                            <!-- FR Tire -->
                            <div style="background:rgba(0,0,0,0.3); padding:6px; border-radius:4px; display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <div style="font-size:10px; font-weight:bold; color:#00f0ff;">FR</div>
                                <div style="display:flex; gap:6px; align-items:center;">
                                    <canvas id="tcTireRadarFR" width="55" height="55" style="width:55px; height:55px;"></canvas>
                                    <canvas id="tcTireHistFR" width="45" height="45" style="width:45px; height:45px; background:rgba(255,255,255,0.03); border-radius:3px;"></canvas>
                                </div>
                            </div>
                            <!-- RL Tire -->
                            <div style="background:rgba(0,0,0,0.3); padding:6px; border-radius:4px; display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <div style="font-size:10px; font-weight:bold; color:#00f0ff;">RL</div>
                                <div style="display:flex; gap:6px; align-items:center;">
                                    <canvas id="tcTireRadarRL" width="55" height="55" style="width:55px; height:55px;"></canvas>
                                    <canvas id="tcTireHistRL" width="45" height="45" style="width:45px; height:45px; background:rgba(255,255,255,0.03); border-radius:3px;"></canvas>
                                </div>
                            </div>
                            <!-- RR Tire -->
                            <div style="background:rgba(0,0,0,0.3); padding:6px; border-radius:4px; display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <div style="font-size:10px; font-weight:bold; color:#00f0ff;">RR</div>
                                <div style="display:flex; gap:6px; align-items:center;">
                                    <canvas id="tcTireRadarRR" width="55" height="55" style="width:55px; height:55px;"></canvas>
                                    <canvas id="tcTireHistRR" width="45" height="45" style="width:45px; height:45px; background:rgba(255,255,255,0.03); border-radius:3px;"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Card 1: Suspension Travel (Vertical Bars & Vertical Charts) -->
                    <div class="tele-card" id="tcCardSuspension" style="display:none; width:300px;">
                        <div class="tele-card-title">📐 Vertical Suspension Travel</div>
                        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; align-items:flex-end;">
                            <!-- FL -->
                            <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <span style="font-size:10px; font-weight:bold; color:#00f0ff;">FL</span>
                                <div style="position:relative; width:16px; height:70px; background:rgba(255,255,255,0.1); border-radius:8px; overflow:hidden; display:flex; flex-direction:column; justify-content:flex-end;">
                                    <div id="tcSuspBarFL" style="width:100%; height:50%; background:#00f0ff; transition:height 0.05s linear;"></div>
                                </div>
                                <span id="tcSuspTextFL" style="font-size:10px; font-family:monospace;">50%</span>
                            </div>
                            <!-- FR -->
                            <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <span style="font-size:10px; font-weight:bold; color:#00f0ff;">FR</span>
                                <div style="position:relative; width:16px; height:70px; background:rgba(255,255,255,0.1); border-radius:8px; overflow:hidden; display:flex; flex-direction:column; justify-content:flex-end;">
                                    <div id="tcSuspBarFR" style="width:100%; height:50%; background:#00f0ff; transition:height 0.05s linear;"></div>
                                </div>
                                <span id="tcSuspTextFR" style="font-size:10px; font-family:monospace;">50%</span>
                            </div>
                            <!-- RL -->
                            <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <span style="font-size:10px; font-weight:bold; color:#00f0ff;">RL</span>
                                <div style="position:relative; width:16px; height:70px; background:rgba(255,255,255,0.1); border-radius:8px; overflow:hidden; display:flex; flex-direction:column; justify-content:flex-end;">
                                    <div id="tcSuspBarRL" style="width:100%; height:50%; background:#00f0ff; transition:height 0.05s linear;"></div>
                                </div>
                                <span id="tcSuspTextRL" style="font-size:10px; font-family:monospace;">50%</span>
                            </div>
                            <!-- RR -->
                            <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <span style="font-size:10px; font-weight:bold; color:#00f0ff;">RR</span>
                                <div style="position:relative; width:16px; height:70px; background:rgba(255,255,255,0.1); border-radius:8px; overflow:hidden; display:flex; flex-direction:column; justify-content:flex-end;">
                                    <div id="tcSuspBarRR" style="width:100%; height:50%; background:#00f0ff; transition:height 0.05s linear;"></div>
                                </div>
                                <span id="tcSuspTextRR" style="font-size:10px; font-family:monospace;">50%</span>
                            </div>
                        </div>
                    </div>

                </div>
            `;

            this.initialized = true;
        },

        update: function (data, elements) {
            if (!this.containerEl) return;
            if (!this.initialized) this.init(this.containerEl);

            elements = elements || {};

            // Elements Visibility (Engine Card is removed as per requirement)
            document.getElementById('tcCardSuspension').style.display = elements.showTeleSuspension ? 'block' : 'none';
            document.getElementById('tcCardTires').style.display = elements.showTeleTires ? 'block' : 'none';
            document.getElementById('tcCardAttitude').style.display = elements.showTeleAttitude ? 'block' : 'none';

            if (!data) return;

            // 1. G-Force Radar & Dynamics (Stacked Vertical Values)
            if (elements.showTeleAttitude) {
                var lat = (data.accel_x || 0) / 9.81;
                var lon = (data.accel_z || 0) / 9.81;
                
                var dot = document.getElementById('tcGDot');
                if (dot) {
                    var xClamped = Math.max(-2, Math.min(2, lat)) * 25;
                    var yClamped = Math.max(-2, Math.min(2, lon)) * 25;
                    dot.style.transform = 'translate(' + xClamped + 'px, ' + yClamped + 'px)';
                }

                var latEl = document.getElementById('tcLatG'); if (latEl) latEl.textContent = Math.abs(lat).toFixed(2);
                var lonEl = document.getElementById('tcLonG'); if (lonEl) lonEl.textContent = Math.abs(lon).toFixed(2);
                var azEl = document.getElementById('tcAccelZ'); if (azEl) azEl.textContent = (data.accel_z || 1.0).toFixed(2) + 'G';
            }

            // 2. Tire Radars & Temp Histograms (Pure Visuals: No Text Values)
            if (elements.showTeleTires) {
                const keys = ['FL', 'FR', 'RL', 'RR'];
                const slipRatios = [data.slip_fl, data.slip_fr, data.slip_rl, data.slip_rr];
                const temps = data.TireTemp || [180, 180, 180, 180];

                for (let i = 0; i < 4; i++) {
                    const tag = keys[i];
                    const ratio = slipRatios[i] || 0;
                    const temp = temps[i] || 180;

                    // Render Tire 2D Slip Radar Canvas
                    var rCanvas = document.getElementById('tcTireRadar' + tag);
                    if (rCanvas) {
                        var ctx = rCanvas.getContext('2d');
                        if (ctx) {
                            ctx.clearRect(0, 0, 55, 55);
                            ctx.beginPath();
                            ctx.arc(27.5, 27.5, 25, 0, Math.PI * 2);
                            ctx.strokeStyle = Math.abs(ratio) > 0.3 ? '#ff003c' : 'rgba(255,255,255,0.2)';
                            ctx.lineWidth = 1.5;
                            ctx.stroke();

                            ctx.beginPath();
                            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                            ctx.moveTo(0, 27.5); ctx.lineTo(55, 27.5);
                            ctx.moveTo(27.5, 0); ctx.lineTo(27.5, 55);
                            ctx.stroke();

                            var dotX = 27.5;
                            var dotY = 27.5 + Math.max(-1.5, Math.min(1.5, ratio)) * 14;
                            ctx.beginPath();
                            ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
                            ctx.fillStyle = Math.abs(ratio) > 0.3 ? '#ff003c' : '#00f0ff';
                            ctx.shadowBlur = 6;
                            ctx.shadowColor = Math.abs(ratio) > 0.3 ? '#ff003c' : '#00f0ff';
                            ctx.fill();
                            ctx.shadowBlur = 0;
                        }
                    }

                    // Render Tire Temp Histogram Canvas
                    var tCanvas = document.getElementById('tcTireHist' + tag);
                    if (tCanvas) {
                        var tCtx = tCanvas.getContext('2d');
                        if (tCtx) {
                            tCtx.clearRect(0, 0, 45, 45);
                            var color = getTempColor(temp);
                            tCtx.fillStyle = color;
                            var heightPct = Math.max(0.1, Math.min(1.0, (temp - 100) / 160));
                            var barH = heightPct * 45;
                            tCtx.fillRect(10, 45 - barH, 25, barH);
                        }
                    }
                }
            }

            // 3. Vertical Suspension Travel
            if (elements.showTeleSuspension) {
                const keys = ['FL', 'FR', 'RL', 'RR'];
                const travels = [data.susp_fl, data.susp_fr, data.susp_rl, data.susp_rr];

                for (let i = 0; i < 4; i++) {
                    const tag = keys[i];
                    const val = Math.max(0, Math.min(1, travels[i] || 0.5));

                    var txtEl = document.getElementById('tcSuspText' + tag);
                    if (txtEl) txtEl.textContent = Math.round(val * 100) + '%';

                    var barEl = document.getElementById('tcSuspBar' + tag);
                    if (barEl) barEl.style.height = (val * 100) + '%';
                }
            }
        }
    };

    window.TelemetryCardsManager = TelemetryCardsManager;

})(window);
