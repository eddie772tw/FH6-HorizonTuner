package org.horizontuner.companion.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.horizontuner.companion.core.transport.WebSocketTransport
import org.horizontuner.companion.core.transport.TransportState
import org.horizontuner.companion.theme.LocalCompanionTokens
import org.json.JSONObject
import java.net.URI

@Composable
internal fun NativePages(page: OfflinePage, session: NativeSession, token: String, detail: Boolean, setDetail: (Boolean) -> Unit) {
    when (page) {
        OfflinePage.TELEMETRY -> NativeTelemetry(session, token, detail, setDetail)
        OfflinePage.TUNING -> NativeTuning(session)
        OfflinePage.CONNECTION -> Unit
    }
}

@Composable
private fun NativeTelemetry(session: NativeSession, token: String, detail: Boolean, setDetail: (Boolean) -> Unit) {
    val origin = session.origin
    val endpoint = remember(origin) { URI(origin) }
    val transport = remember(origin, token) {
        WebSocketTransport(endpoint.host, if (endpoint.port > 0) endpoint.port else if (endpoint.scheme == "https") 443 else 80,
            token, useBinary = false, secure = endpoint.scheme == "https")
    }
    var frame by remember(origin) { mutableStateOf<JSONObject?>(null) }
    var lastFrame by remember(origin) { mutableLongStateOf(0L) }
    var history by remember(origin) { mutableStateOf<List<JSONObject>>(emptyList()) }
    var lastSample by remember(origin) { mutableLongStateOf(0L) }
    var fresh by remember(origin) { mutableStateOf(false) }
    LaunchedEffect(transport) {
        try {
            launch { transport.incomingRawJson.collect { raw ->
                runCatching { JSONObject(raw) }.getOrNull()?.let { frame = it; lastFrame = android.os.SystemClock.elapsedRealtime()
                    if (lastFrame - lastSample >= 100) {
                        history = (history + it).takeLast(60); lastSample = lastFrame
                    } }
            } }
            while (true) {
                if (transport.state.value in listOf(TransportState.DISCONNECTED, TransportState.ERROR)) { transport.disconnect(); transport.connect() }
                fresh = android.os.SystemClock.elapsedRealtime() - lastFrame < 2000
                if (!fresh) history = emptyList()
                delay(500)
            }
        } finally { transport.disconnect() }
    }
    val cards = listOf("主儀表", "駕駛輸入", "車身動態", "輪胎", "懸吊")
    val pager = rememberPagerState { cards.size }
    val scope = rememberCoroutineScope()
    BackHandler(detail) { setDetail(false) }
    Column(Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("${cards[pager.currentPage]}  ${pager.currentPage + 1}/${cards.size}", style = MaterialTheme.typography.titleMedium)
            Text(if (fresh) "即時遙測" else "等待遙測訊號", color = LocalCompanionTokens.current.textSecondary)
            TextButton(onClick = { setDetail(!detail) }) { Text(if (detail) "返回單卡" else "詳細資料") }
        }
        if (detail) {
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                TelemetryCard(pager.currentPage, if (fresh) frame else null, history)
                Text("原始遙測欄位（遊戲原生單位）", style = MaterialTheme.typography.titleMedium)
                if (fresh) frame?.keys()?.asSequence()?.sorted()?.forEach { key ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(key, Modifier.weight(1f)); Text(frame?.opt(key)?.toString() ?: "—", Modifier.weight(1f))
                    }
                }
            }
        } else {
            HorizontalPager(state = pager, modifier = Modifier.weight(1f), key = { it }) { index ->
                if (index == 0) MainHud(session, if (fresh) frame else null)
                else Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(8.dp)) {
                    TelemetryCard(index, if (fresh) frame else null, history)
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(enabled = pager.currentPage > 0, onClick = { scope.launch { pager.animateScrollToPage(pager.currentPage - 1) } }) { Text("上一張") }
                Text("左右滑動切換", color = LocalCompanionTokens.current.textSecondary)
                TextButton(enabled = pager.currentPage < cards.lastIndex, onClick = { scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } }) { Text("下一張") }
            }
        }
    }
}

@Composable
private fun TelemetryCard(index: Int, frame: JSONObject?, history: List<JSONObject>) {
    val tokens = LocalCompanionTokens.current
    Column(Modifier.fillMaxWidth().background(tokens.surface, tokens.panelShape).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (index == 0) {
            MainInstrument(frame)
        } else {
            when (index) {
                1 -> TelemetryPlot(listOf("AccelInput", "BrakeInput", "SteerInput").map { key ->
                    history.map { inputPercent(it.optDouble(key, 0.0), key == "SteerInput") }
                }, listOf("油門 %", "煞車 %", "轉向 %"), -100f, 100f)
                2 -> TelemetryPlot(listOf("AccelerationX", "AccelerationY", "AccelerationZ").map { key ->
                    history.map { it.optDouble(key, 0.0).toFloat().takeIf { value -> value.isFinite() } ?: 0f }
                }, listOf("橫向 m/s²", "垂直 m/s²", "縱向 m/s²"), -20f, 20f)
                4 -> TelemetryPlot((0..3).map { wheel -> history.map {
                    it.optJSONArray("NormalizedSuspensionTravel")?.optDouble(wheel, 0.0)?.toFloat()?.takeIf { value -> value.isFinite() } ?: 0f
                } }, listOf("左前", "右前", "左後", "右後"), 0f, 1f)
            }
            val fields = when (index) {
                1 -> listOf("AccelInput" to "油門 / 255", "BrakeInput" to "煞車 / 255", "ClutchInput" to "離合器 / 255", "SteerInput" to "轉向 / ±127")
                2 -> listOf("AccelerationX" to "橫向加速度 m/s²", "AccelerationY" to "垂直加速度 m/s²", "AccelerationZ" to "縱向加速度 m/s²", "Yaw" to "Yaw rad", "Pitch" to "Pitch rad", "Roll" to "Roll rad")
                3 -> listOf("TireTemp" to "胎溫 °F", "TireSlipRatio" to "滑移率", "TireSlipAngle" to "滑移角", "TireCombinedSlip" to "綜合滑移")
                else -> listOf("NormalizedSuspensionTravel" to "懸吊行程比例", "SuspensionTravelMeters" to "懸吊行程 m", "WheelRotationSpeed" to "車輪轉速 rad/s")
            }
            if (index >= 3) Text("四輪順序：左前 · 右前 · 左後 · 右後", style = MaterialTheme.typography.labelLarge)
            fields.forEach { (key, label) ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(label, Modifier.weight(1f)); Text(frame?.opt(key)?.toString() ?: "—", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                }
            }
        }
    }
}

@Composable
private fun MainInstrument(frame: JSONObject?) {
    val reading = mainInstrumentReading(frame?.optDouble("SpeedMetersPerSecond", Double.NaN),
        frame?.optDouble("CurrentEngineRpm", Double.NaN), frame?.optDouble("EngineMaxRpm", Double.NaN),
        if (frame?.has("Gear") == true) frame.optInt("Gear") else null)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
        Column { Text("速度 km/h"); Text(reading.speedKmh?.toString() ?: "—", style = MaterialTheme.typography.displayLarge) }
        Column { Text("檔位"); Text(reading.gear, style = MaterialTheme.typography.displayLarge) }
        Column { Text("引擎 RPM"); Text(reading.rpm?.toString() ?: "—", style = MaterialTheme.typography.displayLarge) }
    }
    LinearProgressIndicator(progress = { reading.rpmFraction }, modifier = Modifier.fillMaxWidth().height(12.dp))
}
