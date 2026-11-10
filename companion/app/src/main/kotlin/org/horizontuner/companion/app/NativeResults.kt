package org.horizontuner.companion.app

import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import org.json.JSONObject
import java.util.Locale

@Composable
internal fun NativeResults(snapshot: JSONObject) {
    val results = snapshot.optJSONObject("results") ?: return
    Text("PC 調校建議", style = MaterialTheme.typography.headlineSmall)
    when (snapshot.optString("calculationStatus")) {
        "pending" -> { Text("正在計算目前車輛的建議…"); return }
        "error" -> { Text("計算暫時無法完成，請檢查 PC 連線與車輛資料。"); return }
    }
    val chassis = results.optJSONObject("chassis")
    Text("底盤", style = MaterialTheme.typography.titleMedium)
    if (chassis == null) Text("尚無建議，請補齊車輛資料。") else {
        val springs = chassis.optJSONObject("springs")
        ResultLine("彈簧 前 / 後", pair(springs, "front", "rear"), "kgf/mm")
        ResultLine("車高 前 / 後", pair(springs, "heightF", "heightR"), "cm")
        ResultLine("回彈 前 / 後", pair(chassis.optJSONObject("damping"), "reboundF", "reboundR"))
        ResultLine("壓縮 前 / 後", pair(chassis.optJSONObject("damping"), "bumpF", "bumpR"))
        ResultLine("防傾桿 前 / 後", pair(chassis.optJSONObject("arb"), "front", "rear"))
        ResultLine("差速器加速 前 / 後", pair(chassis.optJSONObject("diff"), "accelF", "accelR"), "%")
        ResultLine("差速器減速 前 / 後", pair(chassis.optJSONObject("diff"), "decelF", "decelR"), "%")
        ResultLine("中央差速器後軸", number(chassis.optJSONObject("diff"), "centerRear"), "%")
    }
    Text("輪胎定位", style = MaterialTheme.typography.titleMedium)
    val alignment = results.optJSONObject("alignment")
    if (alignment == null) Text("尚無定位建議。") else {
        ResultLine("冷胎壓 前 / 後", pair(alignment, "pcF", "pcR"), "psi")
        ResultLine("熱胎壓目標", number(alignment, "targetPhot"), "psi")
        ResultLine("外傾角 前 / 後", pair(alignment.optJSONObject("camber"), "front", "rear"), "°")
        ResultLine("束角 前 / 後", pair(alignment.optJSONObject("toe"), "front", "rear"), "°")
        ResultLine("後傾角", number(alignment, "caster"), "°")
    }
    Text("齒輪比", style = MaterialTheme.typography.titleMedium)
    val gearing = results.optJSONObject("gearing")
    if (results.optJSONObject("cvt") != null) Text("CVT 使用獨立量測流程，請於 PC 檢視資格與診斷。")
    else if (gearing == null) Text("完成有效引擎量測後，PC 才能提供齒比建議。")
    else {
        ResultLine("終傳比", number(gearing, "finalDrive", 3))
        gearing.optJSONArray("gears")?.let { gears ->
            for (index in 0 until gears.length()) {
                val value = gears.optDouble(index, Double.NaN)
                ResultLine("${index + 1} 檔", if (value.isFinite()) String.format(Locale.ROOT, "%.3f", value) else "—")
            }
        }
    }
}

private fun number(value: JSONObject?, key: String, digits: Int = 1): String {
    val n = value?.optDouble(key, Double.NaN) ?: Double.NaN
    return if (n.isFinite()) String.format(Locale.ROOT, "%.${digits}f", n) else "—"
}
private fun pair(value: JSONObject?, front: String, rear: String) = "${number(value, front)} / ${number(value, rear)}"

@Composable
private fun ResultLine(label: String, value: String, unit: String = "") {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text("$value $unit", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
    }
}
