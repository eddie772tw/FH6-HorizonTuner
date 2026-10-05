(function (root) {
    'use strict';
    var M = root.R34Model, I = root.R34Instruments;
    var MODE_TITLES = { single: 'SINGLE · BOOST', twin: 'TWIN · BOOST / RPM', multi: 'MULTI MONITOR', g: 'G INDICATION', lap: 'LAP TIME' };
    var MODE_NOTES = { single: '30 s trace · session peak · pressure unit adapted', twin: 'Game mapping: boost / RPM · session peaks', multi: 'Seven game channels · original green-bar layout', g: 'Vehicle axes −X / Z ÷ 9.80665 · ±1.5 g', lap: 'Game timing · history begins when laps are observed' };
    function value(n, precision) { return n === null || !Number.isFinite(n) ? 'N/A' : n.toFixed(precision || 0); }
    function Renderer(doc) {
        this.doc = doc; this.mode = ''; this.unit = ''; this.lastStatus = ''; this.historySequence = -1; this.historyLive = null;
        this.palette = {}; this.nodes = {}; this.rows = []; this.lapRows = []; this.lcdMode = '';
        doc.getElementById('r34Paints').innerHTML = root.R34Artwork.defs;
        doc.getElementById('r34TachModule').innerHTML = root.R34ClusterArt.main('tach');
        doc.getElementById('r34SpeedModule').innerHTML = root.R34ClusterArt.main('speed');
        doc.getElementById('r34BoostModule').innerHTML = root.R34ClusterArt.auxiliary('boost');
        doc.getElementById('r34TempModule').innerHTML = root.R34ClusterArt.auxiliary('temperature');
        doc.getElementById('r34SingleDial').innerHTML = I.mfdDialMarkup('r34Single', 'BOOST');
        doc.getElementById('r34TwinBoost').innerHTML = I.mfdDialMarkup('r34TwinB', 'BOOST');
        doc.getElementById('r34TwinRpm').innerHTML = I.mfdDialMarkup('r34TwinR', 'ENGINE');
        var labels = ['BOOST', 'ENGINE', 'THROTTLE', 'BRAKE', 'POWER', 'TORQUE', 'TIRE TEMP'];
        var keys = ['boost', 'rpm', 'throttle', 'brake', 'power', 'torque', 'tireTemperature'];
        var multi = doc.getElementById('r34Multi');
        for (var n = 0; n < labels.length; n++) {
            var row = doc.createElement('div'); row.className = 'r34-multi-row';
            row.innerHTML = '<label>' + labels[n] + '</label><div class="r34-bar"><i></i></div><strong><span>N/A</span><small></small></strong>';
            multi.appendChild(row); this.rows.push({ key: keys[n], bar: row.querySelector('i'), value: row.querySelector('strong span'), unit: row.querySelector('small') });
        }
        for (var j = 0; j < 5; j++) {
            var li = doc.createElement('li'); li.innerHTML = '<span>—</span><span>—\'——.———</span>';
            doc.getElementById('r34LapList').appendChild(li); this.lapRows.push(li);
        }
        var all = doc.querySelectorAll('[id]'); for (var k = 0; k < all.length; k++) this.nodes[all[k].id] = all[k];
        this.history = this.nodes.r34History.getContext('2d'); this.g = this.nodes.r34G.getContext('2d');
        this.historyGeometry = root.R34CanvasGeometry.geometry(0, 0, 1, 1);
        this.gGeometry = root.R34CanvasGeometry.geometry(0, 0, 1, 1);
        this.pages = doc.querySelectorAll('[data-mode]');
        I.setDialLabels(this.nodes['r34TwinR-labels'], 0, 10);
        this.nodes['r34TwinR-unit'].textContent = 'x1000 rpm';
        this.updatePalette();
    }
    Renderer.prototype.layout = function (width, height, scale) {
        var n = this.nodes, shown = n.r34Container.dataset.cluster !== 'hidden';
        var g = root.R34Layout.layout(width, height, scale, shown);
        var ids = ['r34TachModule', 'r34SpeedModule', 'r34BoostModule', 'r34TempModule', 'r34Mfd'];
        var boxes = [g.tach, g.speed, g.boost, g.temperature, g.screen];
        for (var i = 0; i < ids.length; i++) {
            var style = n[ids[i]].style, box = boxes[i];
            style.left = box.x + 'px'; style.top = box.y + 'px';
            style.width = box.width + 'px'; style.height = box.height + 'px';
        }
        n.r34Screen.style.transform = 'scale(' + g.screen.width / 270 + ')';
        n.r34ClusterNote.style.left = g.note.x - 80 * g.scale + 'px';
        n.r34ClusterNote.style.top = g.note.y + 76 * g.scale + 'px';
        n.r34ClusterNote.style.transform = 'scale(' + g.scale + ')';
        n.r34StreamStatus.style.left = (shown ? g.status.x : g.screen.x + g.screen.width / 2) + 'px';
        n.r34StreamStatus.style.top = Math.min(height - 14, g.status.y) + 'px';
        this.layoutGeometry = g;
        return g.screen.width / 270;
    };
    Renderer.prototype.resizeCanvases = function (scale, dpr) {
        // Layout reads occur only on resize/config/scale/DPR changes, never in render().
        var pairs = [['history', 'historyGeometry'], ['g', 'gGeometry']];
        for (var i = 0; i < pairs.length; i++) {
            var context = this[pairs[i][0]]; if (!context) continue;
            var canvas = context.canvas;
            var geometry = root.R34CanvasGeometry.geometry(canvas.clientWidth, canvas.clientHeight, scale, dpr);
            this[pairs[i][1]] = geometry;
            if (!geometry.drawable) continue; // Hidden / zero-size surfaces allocate nothing.
            if (canvas.width !== geometry.pixelWidth || canvas.height !== geometry.pixelHeight) {
                canvas.width = geometry.pixelWidth; canvas.height = geometry.pixelHeight;
            }
            context.setTransform(geometry.xScale, 0, 0, geometry.yScale, 0, 0);
        }
        this.historySequence = -1;
    };
    Renderer.prototype.updatePalette = function () {
        var style = getComputedStyle(this.nodes.r34Container);
        var names = ['grid', 'ink', 'screen', 'green', 'hot', 'teal', 'dim'];
        for (var i = 0; i < names.length; i++) this.palette[names[i]] = style.getPropertyValue('--r34-' + names[i]).trim();
        this.historySequence = -1;
    };
    Renderer.prototype.configure = function (config) {
        var settings = M.normalizeConfig(config), nodes = this.nodes;
        nodes.r34Container.dataset.lighting = settings.r34Lighting;
        nodes.r34Container.dataset.cluster = settings.r34ShowCluster ? 'shown' : 'hidden';
        nodes.r34Cluster.hidden = !settings.r34ShowCluster;
        if (this.mode !== settings.r34MfdMode) {
            this.mode = settings.r34MfdMode;
            for (var i = 0; i < this.pages.length; i++) this.pages[i].hidden = this.pages[i].dataset.mode !== this.mode;
            nodes.r34ModeTitle.textContent = MODE_TITLES[this.mode]; nodes.r34ModeNote.textContent = MODE_NOTES[this.mode];
            this.historySequence = -1;
        }
        var e = config.elements || {};
        nodes.r34Container.hidden = e.showGauge === false;
        // The full viewport is stationary; each instrument owns its independent anchor.
        nodes.r34Container.style.display = e.showGauge === false ? 'none' : 'block';
        nodes.r34Mfd.hidden = e.showCenterInfo === false;
        nodes.r34TachFace.hidden = e.showRPM === false;
        nodes.r34TachNeedle.style.display = e.showRPM === false ? 'none' : '';
        nodes.r34SpeedFace.style.display = e.showSpeed === false ? 'none' : '';
        nodes.r34SpeedNeedle.style.display = e.showSpeed === false ? 'none' : '';
        nodes.r34DigitalSpeedGroup.style.display = e.showSpeed === false ? 'none' : '';
        nodes.r34GearGroup.style.display = e.showGear === false ? 'none' : '';
        nodes.r34TachFace.style.display = e.showRPM === false ? 'none' : '';
        var color = config.useDefaultColors === false && /^#[0-9a-f]{6}$/i.test(config.customColor || '') ? config.customColor : '';
        nodes.r34Container.style.setProperty('--r34-green', color || '#77b95a');
        this.updatePalette();
    };
    Renderer.prototype.text = function (id, text) { if (this.nodes[id].textContent !== text) this.nodes[id].textContent = text; };
    Renderer.prototype.dial = function (id, reading, ratio, peak, precision) {
        this.text(id + '-value', value(reading, precision)); this.text(id + '-peak', value(peak, precision));
        this.nodes[id + '-sector'].setAttribute('d', I.sector(ratio));
    };
    Renderer.prototype.render = function (view, state, config) {
        var n = this.nodes, e = config.elements || {};
        this.text('r34Status', view.status.toUpperCase());
        this.text('r34StreamStatus', view.live ? '' : view.status === 'waiting' ? 'WAITING FOR TELEMETRY' : view.status === 'paused' ? 'PAUSED · N/A' : view.status === 'error' ? 'TELEMETRY ERROR' : view.status === 'unavailable' ? 'UNAVAILABLE' : 'STALE · N/A');
        n.r34Container.dataset.status = view.status;
        n.r34TachNeedle.setAttribute('transform', 'translate(108 108) rotate(' + I.tachAngle(view.rpm) + ')');
        n.r34TachNeedle.style.visibility = view.rpm === null ? 'hidden' : 'visible';
        var physicalSpeed = view.speedKmh; // Analog face remains fixed kmh; LCD uses selected units.
        n.r34SpeedNeedle.setAttribute('transform', 'translate(108 108) rotate(' + I.speedAngle(physicalSpeed) + ')');
        n.r34SpeedNeedle.style.visibility = view.speed === null ? 'hidden' : 'visible';
        this.text('r34Gear', view.gear); this.text('r34DigitalSpeed', value(view.speed));
        this.text('r34DigitalSpeedUnit', view.speedUnit);
        this.drawLcd(view, e);
        var speedOver = e.showSpeed !== false && physicalSpeed > I.SPEED_MAX, rpmOver = e.showRPM !== false && view.rpm > 10000;
        this.text('r34ClusterNote', (speedOver ? 'SPEED OVER SCALE' : '') + (rpmOver ? (speedOver ? '\n' : '') + 'RPM OVER SCALE: ' + Math.round(view.rpm) : ''));
        n.r34RevLamp.classList.toggle('active', view.live && view.rpm !== null && view.redline !== null && view.rpm >= view.redline && e.showRPM !== false);
        if (this.unit !== view.boostSpec.unit) {
            this.unit = view.boostSpec.unit;
            I.setDialLabels(n['r34Single-labels'], view.boostSpec.min, view.boostSpec.max);
            I.setDialLabels(n['r34TwinB-labels'], view.boostSpec.min, view.boostSpec.max);
            I.setHistoryLabels(n.r34HistoryLabels, view.boostSpec.min, view.boostSpec.max);
            I.setAuxiliaryLabels(n.r34BoostAuxLabels, view.boostSpec.min, view.boostSpec.max);
            this.text('r34BoostUnit', view.boostSpec.unit);
            this.text('r34HistoryUnit', view.boostSpec.unit);
            this.text('r34Single-unit', view.boostSpec.unit); this.text('r34TwinB-unit', view.boostSpec.unit); this.historySequence = -1;
        }
        var boost = e.showBoost === false ? null : view.boost, boostRatio = e.showBoost === false ? null : view.boostRatio;
        n.r34BoostNeedle.setAttribute('transform', I.auxiliaryTransform('boost', boostRatio));
        n.r34BoostNeedle.style.visibility = boost === null ? 'hidden' : 'visible';
        n.r34TempNeedle.setAttribute('transform', I.auxiliaryTransform('temperature', view.tireTemperatureRatio));
        n.r34TempNeedle.style.visibility = view.tireTemperature === null ? 'hidden' : 'visible';
        this.text('r34BoostValue', value(boost, view.boostSpec.decimals));
        this.text('r34TempValue', value(view.tireTemperature, 1));
        this.text('r34TempUnit', view.tireTemperatureUnit);
        if (this.mode === 'single') {
            this.dial('r34Single', boost, boostRatio, e.showBoost === false ? null : view.peakBoost, view.boostSpec.decimals);
            if (this.historySequence !== state.sequence || this.historyLive !== view.live) { this.drawHistory(view, state, e.showBoost !== false); this.historySequence = state.sequence; this.historyLive = view.live; }
        } else if (this.mode === 'twin') {
            this.dial('r34TwinB', boost, boostRatio, e.showBoost === false ? null : view.peakBoost, view.boostSpec.decimals);
            this.dial('r34TwinR', e.showRPM === false || view.rpm === null ? null : view.rpm / 1000, e.showRPM === false ? null : M.ratio(view.rpm, 0, 10000), e.showRPM === false || view.peakRpm === null ? null : view.peakRpm / 1000, 1);
        } else if (this.mode === 'multi') this.drawMulti(view, e);
        else if (this.mode === 'g') this.drawG(view);
        else this.drawLap(view);
    };
    Renderer.prototype.drawLcd = function (view, elements) {
        var mode = view.tachLcdMode, n = this.nodes;
        if (mode !== this.lcdMode) {
            this.lcdMode = mode;
            n.r34TachLcd.setAttribute('data-lcd-mode', mode);
            n.r34TachTimerGroup.style.display = mode === 'timer' ? '' : 'none';
            n.r34TachPowerGroup.style.display = mode === 'power' ? '' : 'none';
            n.r34TachUnavailable.style.display = mode === 'unavailable' ? '' : 'none';
        }
        this.text('r34TachTimer', M.timerTime(view.timerSeconds));
        this.text('r34LcdPower', value(elements.showPowerTorque === false ? null : view.power) + ' ' + view.powerUnit);
        this.text('r34LcdTorque', value(elements.showPowerTorque === false ? null : view.torque) + ' ' + view.torqueUnit);
    };
    Renderer.prototype.drawMulti = function (v, e) {
        for (var i = 0; i < this.rows.length; i++) {
            var row = this.rows[i], num = v[row.key], max = 100, min = 0, unit = '%', precision = 0;
            if (row.key === 'boost') { min = v.boostSpec.min; max = v.boostSpec.max; unit = v.boostSpec.unit; precision = v.boostSpec.decimals; if (e.showBoost === false) num = null; }
            if (row.key === 'rpm') { max = 10000; unit = 'rpm'; if (e.showRPM === false) num = null; }
            if (row.key === 'power') { max = v.powerUnit === 'kW' ? 750 : 1000; unit = v.powerUnit; if (e.showPowerTorque === false) num = null; }
            if (row.key === 'torque') { max = v.torqueUnit === 'N·m' ? 1500 : 1100; unit = v.torqueUnit; if (e.showPowerTorque === false) num = null; }
            if (row.key === 'tireTemperature') { min = 0; max = 150; unit = v.tireTemperatureUnit; precision = 1; }
            row.value.textContent = value(num, precision); row.unit.textContent = unit;
            row.bar.style.transform = 'scaleX(' + ((row.key === 'tireTemperature' ? v.tireTemperatureRatio : M.ratio(num, min, max)) || 0) + ')';
        }
    };
    Renderer.prototype.drawHistory = function (v, state, show) {
        var c = this.history; if (!c) return;
        var geometry = this.historyGeometry; if (!geometry.drawable) return;
        var w = geometry.width, h = geometry.height, p = this.palette;
        c.clearRect(0, 0, w, h); c.strokeStyle = p.grid; c.lineWidth = .5;
        for (var x = 0; x <= 3; x++) { c.beginPath(); c.moveTo(x * w / 3, 0); c.lineTo(x * w / 3, h); c.stroke(); }
        for (var y = 0; y <= 25; y++) { c.beginPath(); c.moveTo(0, y * h / 25); c.lineTo(w, y * h / 25); c.stroke(); }
        if (!show) return;
        c.strokeStyle = v.live ? p.green : p.dim; c.lineWidth = 1.5; c.beginPath(); var pen = false;
        for (var i = 0; i < state.historyCount; i++) {
            var at = (state.historyHead - state.historyCount + i + M.CAPACITY) % M.CAPACITY;
            var age = state.elapsed - state.historyTime[at], raw = state.historyBoost[at];
            if (age > M.WINDOW_MS || !Number.isFinite(raw)) { pen = false; continue; }
            var px = w * (1 - age / M.WINDOW_MS), py = h * (1 - M.ratio(raw * v.boostSpec.factor, v.boostSpec.min, v.boostSpec.max));
            if (i > 0) { var before = (at - 1 + M.CAPACITY) % M.CAPACITY; if (state.historyTime[at] - state.historyTime[before] > 1000) pen = false; }
            if (pen) c.lineTo(px, py); else c.moveTo(px, py); pen = true;
        }
        c.stroke();
    };
    Renderer.prototype.drawG = function (v) {
        var c = this.g; if (!c) return;
        var geometry = this.gGeometry; if (!geometry.drawable) return;
        var w = geometry.width, h = geometry.height, p = this.palette;
        c.clearRect(0, 0, w, h); c.strokeStyle = p.grid; c.lineWidth = .4;
        for (var i = 0; i <= 20; i++) { c.beginPath(); c.moveTo(i * w / 20, 0); c.lineTo(i * w / 20, h); c.stroke(); }
        for (var j = 0; j <= 12; j++) { c.beginPath(); c.moveTo(0, j * h / 12); c.lineTo(w, j * h / 12); c.stroke(); }
        c.strokeStyle = p.ink; c.lineWidth = 1; c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
        c.fillStyle = p.dim; c.font = 'italic 10px Arial'; c.fillText('−1.5', 3, 12); c.fillText('+1.5', w - 29, 12); c.fillText('BRAKE', w / 2 + 6, 12); c.fillText('ACCEL', w / 2 + 6, h - 6);
        if (v.lateralG !== null && v.longitudinalG !== null) {
            c.fillStyle = p.hot; c.beginPath(); c.arc(w / 2 + M.clamp(v.lateralG, -1.5, 1.5) / 3 * (w - 10), h / 2 + M.clamp(v.longitudinalG, -1.5, 1.5) / 3 * (h - 10), 5, 0, Math.PI * 2); c.fill();
        }
        this.text('r34Lateral', 'LAT ' + value(v.lateralG, 2) + ' g'); this.text('r34Longitudinal', 'LONG ' + value(v.longitudinalG, 2) + ' g');
    };
    Renderer.prototype.drawLap = function (v) {
        this.text('r34LapNumber', v.lap === null ? '—' : String(v.lap));
        this.text('r34CurrentLap', M.timerTime(v.currentLap)); this.text('r34BestLap', M.lapTime(v.bestLap)); this.text('r34LastLap', M.lapTime(v.lastLap));
        for (var i = 0; i < 5; i++) {
            var row = this.lapRows[i], lap = v.laps[i];
            row.children[0].textContent = lap ? String(lap.number) : '—'; row.children[1].textContent = lap ? M.lapTime(lap.seconds) : "—'——.———";
        }
    };
    root.R34Renderer = Renderer;
})(window);
