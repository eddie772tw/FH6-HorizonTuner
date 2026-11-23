package org.horizontuner.companion.app

import androidx.compose.runtime.*
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/** Authenticated HTTP control plane. A queued command is never a successful save. */
internal class NativeSession(val origin: String, private val token: String) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    val editor = NativeTuningDraft()
    private val clientId = UUID.randomUUID().toString()
    var state by mutableStateOf<JSONObject?>(null)
        private set
    var online by mutableStateOf(false)
        private set
    var busy by mutableStateOf(false)
        private set
    var connectionError by mutableStateOf<String?>(null)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    val snapshot get() = state?.optJSONObject("snapshot")
    val hostOnline get() = online && state?.optBoolean("hostOnline") == true

    private suspend fun request(path: String, body: JSONObject? = null): JSONObject = withContext(Dispatchers.IO) {
        val connection = URL(origin + path).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            connection.instanceFollowRedirects = false
            if (token.isNotBlank()) connection.setRequestProperty("Cookie", "companion_session=$token")
            if (body != null) {
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val ok = connection.responseCode in 200..299
            val stream = if (ok) connection.inputStream else connection.errorStream
            val result = stream?.bufferedReader()?.use { JSONObject(it.readText()) } ?: JSONObject()
            check(ok) { result.optString("detail", "HTTP ${connection.responseCode}") }
            result
        } finally { connection.disconnect() }
    }

    suspend fun hudBytes(path: String, limit: Int): ByteArray = withContext(Dispatchers.IO) {
        require(path.startsWith("/companion/hud/"))
        val connection = URL(origin + path).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 5000
            connection.readTimeout = 15000
            connection.instanceFollowRedirects = false
            if (token.isNotBlank()) connection.setRequestProperty("Cookie", "companion_session=$token")
            check(connection.responseCode in 200..299) { "主程式儀表下載失敗：HTTP ${connection.responseCode}" }
            val output = java.io.ByteArrayOutputStream()
            connection.inputStream.use { input ->
                val buffer = ByteArray(8192)
                while (true) {
                    currentCoroutineContext().ensureActive()
                    val count = input.read(buffer)
                    if (count < 0) break
                    check(output.size() + count <= limit) { "儀表下載大小不符" }
                    output.write(buffer, 0, count)
                }
            }
            output.toByteArray()
        } finally { connection.disconnect() }
    }

    suspend fun poll() {
        if (busy) return
        try {
            val response = request("/api/companion/workflow?clientId=$clientId")
            if (!busy) { state = response; online = true; connectionError = null }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) { if (!busy) { online = false; connectionError = error.message } }
    }

    suspend fun send(intent: JSONObject, expected: JSONObject): Boolean {
        if (busy || !hostOnline) return false
        busy = true
        message = "等待 PC 儲存確認…"
        val id = UUID.randomUUID().toString()
        val command = JSONObject(intent.toString()).put("id", id)
            .put("carId", expected.getString("carId")).put("profileKey", expected.getString("profileKey"))
        try {
            var response = request("/api/companion/commands", command)
            withTimeout(18_000) {
                while (true) {
                    state = response
                    val acks = response.optJSONArray("commands")
                    val ack = (0 until (acks?.length() ?: 0)).map { acks!!.getJSONObject(it) }.find { it.optString("id") == id }
                    when (ack?.optString("status")) {
                        "applied" -> return@withTimeout
                        "rejected" -> error(ack.optString("error", "PC 拒絕此變更"))
                    }
                    delay(300)
                    response = request("/api/companion/workflow?clientId=$clientId")
                }
            }
            message = if (intent.optString("kind") == "save") "車輛與目標已儲存至 PC" else "PC 已套用操作"
            return true
        } catch (timeout: TimeoutCancellationException) { message = "未收到確認，請重新整理後檢查儲存結果" }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) { message = error.message }
        finally { busy = false }
        return false
    }
}
