package org.horizontuner.companion.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.json.JSONObject

private val profileFields = linkedMapOf(
    "weight" to "車重 kg", "weight_distribution" to "前軸配重 %",
    "maxHp" to "最大馬力 hp", "maxTorque" to "最大扭力 Nm",
    "maxHpRpm" to "最大馬力 RPM", "maxTorqueRpm" to "最大扭力 RPM",
    "frontTireWidth" to "前胎寬 mm", "rearTireWidth" to "後胎寬 mm",
    "frontTireAspect" to "前胎扁平比 %", "rearTireAspect" to "後胎扁平比 %",
    "frontTireRim" to "前輪框 in", "rearTireRim" to "後輪框 in",
)

internal class NativeTuningDraft {
    var draft by mutableStateOf<JSONObject?>(null)
    var values by mutableStateOf<Map<String, String>>(emptyMap())
    var goal by mutableStateOf("Road")
    var season by mutableStateOf("Summer")
    var drivetrain by mutableStateOf("RWD")
    var induction by mutableStateOf("NA")
    var validation by mutableStateOf<String?>(null)
}

@Composable
internal fun NativeTuning(session: NativeSession) {
    val snapshot = session.snapshot
    val scope = session.scope
    // Draft retains its original profile key until an explicit reload or acknowledged save.
    val editor = session.editor
    fun reload() {
        val current = session.snapshot?.takeIf { it.optJSONObject("profile") != null } ?: return
        editor.draft = JSONObject(current.toString())
        val profile = current.getJSONObject("profile")
        editor.values = profileFields.keys.associateWith { profile.opt(it)?.takeUnless { it == JSONObject.NULL }?.toString() ?: "" }
        editor.goal = current.optJSONObject("workflow")?.optString("goal", "Road") ?: "Road"
        editor.season = current.optJSONObject("workflow")?.optString("season", "Summer") ?: "Summer"
        editor.drivetrain = profile.optString("drivetrain", "RWD")
        editor.induction = profile.optString("induction", "NA")
        editor.validation = null
    }
    LaunchedEffect(snapshot?.optString("carId"), snapshot?.optJSONObject("profile") != null) {
        if (editor.draft == null) reload()
    }
    val stale = editor.draft != null && (editor.draft!!.optString("carId") != snapshot?.optString("carId") || editor.draft!!.optString("profileKey") != snapshot?.optString("profileKey"))
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(editor.draft?.optString("carName") ?: "等待目前車輛", style = MaterialTheme.typography.headlineSmall)
        Text("車輛 ID：${editor.draft?.optString("carId") ?: "—"} · PC 可停留在任意頁面")
        if (!session.hostOnline) Text("PC 前端未連線，暫時無法編輯或存檔")
        if (stale) Text("車輛或參數已變更；請重新載入後編輯，避免覆蓋其他變更。")
        TextButton(onClick = { reload() }, enabled = !session.busy && snapshot != null) { Text("重新載入 PC 資料（捨棄草稿）") }
        ChoiceRow("目標賽事", listOf("Road", "Rally", "Drift", "Drag"), editor.goal, !session.busy) { editor.goal = it }
        ChoiceRow("季節", listOf("Summer", "Autumn", "Winter", "Spring"), editor.season, !session.busy) { editor.season = it }
        ChoiceRow("驅動形式", listOf("FWD", "RWD", "AWD"), editor.drivetrain, !session.busy) { editor.drivetrain = it }
        ChoiceRow("進氣形式", listOf("NA", "Supercharger", "Turbo", "TwinTurbo"), editor.induction, !session.busy) { editor.induction = it }
        profileFields.forEach { (key, label) ->
            OutlinedTextField(value = editor.values[key] ?: "", onValueChange = { editor.values = editor.values + (key to it) }, label = { Text(label) },
                enabled = editor.draft != null && !session.busy, singleLine = true, modifier = Modifier.fillMaxWidth())
        }
        Button(enabled = session.hostOnline && editor.draft != null && !stale && !session.busy, onClick = {
            val expected = editor.draft ?: return@Button
            val patch = JSONObject().put("drivetrain", editor.drivetrain).put("induction", editor.induction)
            val invalid = editor.values.entries.firstOrNull { (_, value) -> value.isNotBlank() && value.toDoubleOrNull()?.isFinite() != true }
            if (invalid != null) { editor.validation = "請輸入有效數字：${profileFields[invalid.key]}"; return@Button }
            editor.values.filterValues { it.isNotBlank() }.forEach { (key, value) -> patch.put(key, value.toDouble()) }
            editor.validation = null
            val command = JSONObject().put("kind", "save").put("patch", patch).put("goal", editor.goal).put("season", editor.season)
            scope.launch { if (session.send(command, expected)) { session.poll(); reload() } }
        }) { Text(if (session.busy) "儲存中…" else "儲存車輛與目標") }
        (editor.validation ?: session.message)?.let { Text(it) }
        snapshot?.optJSONObject("engine")?.let { engine ->
            val profile = snapshot.optJSONObject("profile")
            val remoteMeasurement = profile?.optBoolean("isElectric") != true && (profile?.optJSONObject("transmission")?.optString("type") ?: "discrete") == "discrete"
            if (!remoteMeasurement) Text("此動力系統請使用 PC 專屬量測流程。")
            Text("引擎量測：${engine.optString("phase")} · ${engine.optInt("sampleCount")} 筆", style = MaterialTheme.typography.titleMedium)
            Row(Modifier.horizontalScroll(rememberScrollState())) {
                listOf("start" to "開始", "pause_resume" to "暫停／繼續", "restart" to "重新量測", "finish" to "儲存量測").forEach { (action, label) ->
                    TextButton(enabled = session.hostOnline && !session.busy && remoteMeasurement, onClick = {
                        scope.launch { session.send(JSONObject().put("kind", "measurement").put("action", action), snapshot) }
                    }) { Text(label) }
                }
            }
        }
        snapshot?.let { NativeResults(it) }
    }
}

@Composable
private fun ChoiceRow(label: String, choices: List<String>, selected: String, enabled: Boolean, select: (String) -> Unit) {
    Text(label, style = MaterialTheme.typography.titleSmall)
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        choices.forEach { choice -> FilterChip(selected = choice == selected, enabled = enabled, onClick = { select(choice) }, label = { Text(choice) }) }
    }
}
