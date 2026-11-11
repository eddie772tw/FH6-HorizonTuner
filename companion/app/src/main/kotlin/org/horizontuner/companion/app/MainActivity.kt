package org.horizontuner.companion.app

import android.Manifest
import android.content.pm.PackageManager
import android.content.Intent
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicReference
import org.horizontuner.companion.app.service.TelemetryForegroundService
import org.horizontuner.companion.theme.HalfmoonTheme
import org.horizontuner.companion.theme.VisualTheme
import java.security.MessageDigest

private const val COMPANION_PATH = "/companion/index.html"
private const val PAIRING_PREFS = "companion_lan_session"

class MainActivity : ComponentActivity() {
    private val visualTheme = mutableStateOf(VisualTheme())
    private val autoConnect = mutableStateOf(false)
    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* handled */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        autoConnect.value = intent.getBooleanExtra("companionAutoConnect", false)
        val preferences = getSharedPreferences(PAIRING_PREFS, Context.MODE_PRIVATE)
        val cachePreferences = getSharedPreferences("companion_visual_theme_v1", Context.MODE_PRIVATE)
        val cache = object : ThemeCache {
            private fun key(origin: String) = MessageDigest.getInstance("SHA-256").digest(origin.toByteArray()).joinToString("") { "%02x".format(it) }
            override fun read(origin: String) = cachePreferences.getString(key(origin), null)
            override fun write(origin: String, raw: String) { cachePreferences.edit().putString(key(origin), raw).apply() }
        }
        val initialOrigin = if (autoConnect.value) "http://127.0.0.1:8001" else buildOrigin(preferences.getString("host", "") ?: "", preferences.getString("port", "") ?: "")?.let(::companionThemeOrigin)
        val themeSession = ThemeSession(cache, initialOrigin)
        visualTheme.value = themeSession.current
        enableEdgeToEdge()
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContent {
            HalfmoonTheme(theme = visualTheme.value) {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    CompanionAppContent(::startTelemetryService, ::stopTelemetryService, autoConnect.value, { autoConnect.value = false }, themeSession) { visualTheme.value = it }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        autoConnect.value = intent.getBooleanExtra("companionAutoConnect", false)
    }

    private fun requestNotificationPermissionIfNecessary() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun startTelemetryService() {
        requestNotificationPermissionIfNecessary()
        ContextCompat.startForegroundService(
            this,
            Intent(this, TelemetryForegroundService::class.java).setAction(TelemetryForegroundService.ACTION_START),
        )
    }

    private fun stopTelemetryService() {
        stopService(Intent(this, TelemetryForegroundService::class.java).setAction(TelemetryForegroundService.ACTION_STOP))
    }

    override fun onDestroy() {
        stopTelemetryService()
        super.onDestroy()
    }
}

@Composable
private fun CompanionAppContent(
    onServiceStart: () -> Unit,
    onServiceStop: () -> Unit,
    autoConnect: Boolean,
    onAutoConnectHandled: () -> Unit,
    themeSession: ThemeSession,
    onThemeChange: (VisualTheme) -> Unit,
) {
    val appContext = androidx.compose.ui.platform.LocalContext.current
    val preferences = remember(appContext) { appContext.getSharedPreferences(PAIRING_PREFS, Context.MODE_PRIVATE) }
    var mode by remember { mutableStateOf(if (autoConnect) ConnectionMode.USB else ConnectionMode.LAN) }
    var host by remember { mutableStateOf(if (autoConnect) "127.0.0.1" else preferences.getString("host", "") ?: "") }
    var port by remember { mutableStateOf(preferences.getString("port", "8001") ?: "8001") }
    var pairingToken by remember { mutableStateOf("") }
    var deviceId by remember { mutableStateOf(preferences.getString("device_id", "") ?: "") }
    var sessionToken by remember { mutableStateOf(preferences.getString("session_token", "") ?: "") }
    var pairedHost by remember { mutableStateOf(preferences.getString("host", "") ?: "") }
    var pairedPort by remember { mutableStateOf(preferences.getString("port", "") ?: "") }
    var state by remember { mutableStateOf(WebConnectionState.DISCONNECTED) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var requestedUrl by remember { mutableStateOf<String?>(null) }

    var showQrScanner by remember { mutableStateOf(false) }
    var manualLanExpanded by remember { mutableStateOf(false) }
    var offlinePage by remember { mutableStateOf(OfflinePage.CONNECTION) }
    var telemetryDetail by remember { mutableStateOf(false) }
    val activity = appContext as? android.app.Activity
    DisposableEffect(offlinePage, telemetryDetail) {
        val prior = activity?.requestedOrientation
        activity?.requestedOrientation = if (offlinePage == OfflinePage.TELEMETRY && !telemetryDetail)
            android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else android.content.pm.ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
        onDispose { if (prior != null) activity?.requestedOrientation = prior }
    }
    var desktopOnline by remember { mutableStateOf(false) }
    var backendOnline by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val connectionAttempt = remember { AtomicReference(UUID.randomUUID().toString()) }
    var connectionGeneration by remember { mutableStateOf(0) }
    fun invalidateThemeCallbacks() {
        connectionAttempt.set(UUID.randomUUID().toString())
        themeSession.invalidate()
        connectionGeneration++
        requestedUrl = null
    }
    fun loadEndpoint(endpoint: String) { requestedUrl = endpoint }

    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) showQrScanner = true else {
            errorMessage = "需要相機權限才能掃描配對 QR 碼"
        }
    }

    fun requestQrScanner() {
        if (ContextCompat.checkSelfPermission(appContext, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            showQrScanner = true
        } else cameraPermission.launch(Manifest.permission.CAMERA)
    }

    val connect: (String, String) -> Unit = { inputHost, inputPort ->
        invalidateThemeCallbacks()
        mode = ConnectionMode.USB
        host = inputHost
        port = inputPort
        val endpoint = buildCompanionUrl(inputHost, inputPort)
        if (endpoint == null) {
            state = WebConnectionState.ERROR
            offlinePage = OfflinePage.CONNECTION
            errorMessage = "請輸入有效的 HTTP(S) 主機與 1-65535 連接埠（僅限區域網路或本機位址）"
        } else {
            loadEndpoint(endpoint)
            errorMessage = null
            state = WebConnectionState.LOADING
        }
    }
    val disconnect: () -> Unit = {
        invalidateThemeCallbacks()
        onServiceStop()
        requestedUrl = null
        errorMessage = null
        state = WebConnectionState.DISCONNECTED
        desktopOnline = false
        backendOnline = false
        offlinePage = OfflinePage.TELEMETRY
        Unit
    }

    fun pairLanCandidates(targetHosts: List<String>, targetPort: String, token: String) {
        val candidates = targetHosts.mapNotNull { candidate -> buildOrigin(candidate, targetPort)?.let { candidate.trim() to it } }
        if (candidates.isEmpty() || token.isBlank()) {
            errorMessage = "請輸入有效的 LAN 主機、連接埠與配對碼"
            state = WebConnectionState.ERROR
            return
        }
        invalidateThemeCallbacks()
        val attempt = connectionAttempt.get()
        mode = ConnectionMode.LAN
        host = candidates.first().first
        port = targetPort.trim()
        state = WebConnectionState.LOADING
        errorMessage = "正在透過 LAN 配對…"
        scope.launch {
            val result = withContext(Dispatchers.IO) {
                var lastFailure: Throwable? = null
                var successfulHost: String? = null
                var paired: LanPairResult? = null
                for ((candidateHost, origin) in candidates) {
                    val attempt = performLanPair(origin, token.trim(), deviceId)
                    attempt.fold(onSuccess = { successfulHost = candidateHost; paired = it }, onFailure = { lastFailure = it })
                    if (paired != null) break
                }
                val result = paired
                if (result == null) Result.failure(lastFailure ?: IllegalStateException("找不到可連線的桌面端"))
                else Result.success(successfulHost!! to result)
            }
            if (connectionAttempt.get() != attempt) return@launch
            result.fold(
                onSuccess = { (successfulHost, paired) ->
                    val origin = buildOrigin(successfulHost, targetPort) ?: return@fold
                    sessionToken = paired.sessionToken
                    deviceId = paired.deviceId
                    pairedHost = successfulHost
                    pairedPort = targetPort.trim()
                    preferences.edit()
                        .putString("session_token", sessionToken)
                        .putString("device_id", deviceId)
                        .putString("host", pairedHost)
                        .putString("port", pairedPort)
                        .apply()
                    loadEndpoint("$origin$COMPANION_PATH")
                    errorMessage = null

                },
                onFailure = { failure ->
                    state = WebConnectionState.ERROR
                    errorMessage = "LAN 配對失敗：${failure.message ?: "連線錯誤"}"
                },
            )
        }
    }

    fun loadLanSession(targetHost: String, targetPort: String, token: String) =
        pairLanCandidates(listOf(targetHost), targetPort, token)

    fun loadLanQrPayload(payload: String): Boolean {
        val parsed = parseLanPairQr(payload)
        val qr = parsed.getOrElse { failure ->
            errorMessage = failure.message?.takeIf(String::isNotBlank) ?: "QR 碼格式無效或不支援"
            return false
        }
        pairingToken = qr.token
        host = qr.lanIps.first()
        port = qr.port.toString()
        pairLanCandidates(qr.lanIps, qr.port.toString(), qr.token)
        return true
    }

    fun reconnectLan() {
        if (sessionToken.isBlank() || pairedHost.isBlank() || pairedPort.isBlank()) {
            errorMessage = "尚未完成 LAN 配對，請輸入配對碼並配對"
            state = WebConnectionState.ERROR
            return
        }
        mode = ConnectionMode.LAN
        host = pairedHost
        port = pairedPort
        val origin = buildOrigin(host, port)
        if (origin == null) {
            errorMessage = "已儲存的 LAN 位址無效，請重新配對"
            state = WebConnectionState.ERROR
            return
        }
        state = WebConnectionState.LOADING
        invalidateThemeCallbacks()
        errorMessage = null
        loadEndpoint("$origin$COMPANION_PATH")
    }

    fun selectMode(value: String) {
        val selectedMode = if (value.equals("LAN", ignoreCase = true)) ConnectionMode.LAN else ConnectionMode.USB
        if (selectedMode != mode && requestedUrl != null) {
            disconnect()
            offlinePage = OfflinePage.CONNECTION
        } else if (selectedMode != mode) {
            invalidateThemeCallbacks()
            state = WebConnectionState.DISCONNECTED
            errorMessage = null
        }
        mode = selectedMode
        if (mode == ConnectionMode.USB) {
            host = "127.0.0.1"
            port = "8001"
        } else if (pairedHost.isNotBlank()) {
            host = pairedHost
            port = pairedPort
        }
    }

    BackHandler(enabled = requestedUrl == null && offlinePage == OfflinePage.CONNECTION) {
        offlinePage = OfflinePage.TELEMETRY
    }
    BackHandler(enabled = requestedUrl != null && state == WebConnectionState.LOADING) {
        disconnect()
    }

    LaunchedEffect(autoConnect) {
        if (autoConnect) {
            mode = ConnectionMode.USB
            host = "127.0.0.1"
            port = "8001"
            connect(host, port)
            onAutoConnectHandled()
        }
    }

    val endpoint = requestedUrl
    val nativeSession = remember(endpoint, sessionToken, mode, connectionGeneration) {
        endpoint?.let { NativeSession(companionThemeOrigin(it), if (mode == ConnectionMode.LAN) sessionToken else "") }
    }
    DisposableEffect(nativeSession) {
        onDispose { nativeSession?.scope?.coroutineContext?.get(kotlinx.coroutines.Job)?.cancel() }
    }
    LaunchedEffect(nativeSession) {
        val session = nativeSession ?: return@LaunchedEffect
        val lease = themeSession.attach(session.origin)
        onThemeChange(themeSession.current)
        while (true) {
            session.poll()
            backendOnline = session.online
            desktopOnline = session.hostOnline
            if (session.online) {
                val firstConnection = state == WebConnectionState.LOADING
                state = WebConnectionState.CONNECTED
                errorMessage = null
                if (firstConnection) { offlinePage = OfflinePage.TELEMETRY; onServiceStart() }
                session.state?.optJSONObject("visualTheme")?.let {
                    if (themeSession.receive(it.toString(), lease.generation, lease)) onThemeChange(themeSession.current)
                }
            } else { errorMessage = session.connectionError; if (state != WebConnectionState.LOADING) state = WebConnectionState.ERROR }
            kotlinx.coroutines.delay(1000)
        }
    }

    CompanionShell(
        state = CompanionShellState(
            page = offlinePage,
            mode = mode,
            host = host,
            port = port,
            pairingToken = pairingToken,
            paired = sessionToken.isNotBlank(),
            deviceId = deviceId,
            connection = state,
            desktopOnline = desktopOnline,
            backendOnline = backendOnline,
            error = errorMessage,
            manualLanExpanded = manualLanExpanded,
            connected = requestedUrl != null && state == WebConnectionState.CONNECTED,
            isDevMode = BuildConfig.DEBUG,
        ),
        actions = CompanionShellActions(
            selectPage = { offlinePage = it; telemetryDetail = false },
            selectMode = { selectMode(it.name) },
            setHost = { host = it },
            setPort = { port = it.filter(Char::isDigit).take(5) },
            setPairingToken = { pairingToken = it.trim().uppercase() },
            scanQr = ::requestQrScanner,
            reconnectLan = ::reconnectLan,
            pairLan = { loadLanSession(host, port, pairingToken) },
            connectUsb = { connect(host, port) },
            disconnect = disconnect,
            toggleManualLan = { manualLanExpanded = !manualLanExpanded },
        ),
    ) {
        nativeSession?.let { NativePages(offlinePage, it, if (mode == ConnectionMode.LAN) sessionToken else "", telemetryDetail) { detail -> telemetryDetail = detail } }
    }

    if (showQrScanner) {
        LanQrScanner(
            onScanned = { payload ->
                val accepted = loadLanQrPayload(payload)
                if (accepted) showQrScanner = false
                accepted
            },
            onClose = { showQrScanner = false },
        )
    }

    DisposableEffect(Unit) {
        onDispose {
            invalidateThemeCallbacks()
            onServiceStop()
        }
    }
}

internal enum class WebConnectionState { DISCONNECTED, LOADING, CONNECTED, ERROR }
internal enum class ConnectionMode { LAN, USB }
internal enum class OfflinePage(val label: String) { TELEMETRY("Telemetry"), TUNING("Tuning"), CONNECTION("Connection") }

private fun companionThemeOrigin(endpoint: String): String {
    val uri = Uri.parse(endpoint)
    val port = if ((uri.scheme == "http" && uri.port == 80) || (uri.scheme == "https" && uri.port == 443)) "" else ":${uri.port}"
    return "${uri.scheme}://${uri.host?.lowercase()}$port"
}

private fun isPrivateOrLoopbackHost(host: String): Boolean {
    val cleanHost = host.trim().lowercase()
    if (cleanHost == "localhost" || cleanHost == "127.0.0.1") return true
    val octets = cleanHost.split('.')
    if (octets.size != 4) return false
    val first = octets[0].toIntOrNull() ?: return false
    val second = octets[1].toIntOrNull() ?: return false
    val third = octets[2].toIntOrNull() ?: return false
    val fourth = octets[3].toIntOrNull() ?: return false
    if (first !in 0..255 || second !in 0..255 || third !in 0..255 || fourth !in 0..255) return false

    // 127.0.0.0/8 (Loopback)
    if (first == 127) return true
    // 10.0.0.0/8 (RFC 1918)
    if (first == 10) return true
    // 172.16.0.0/12 (RFC 1918)
    if (first == 172 && second in 16..31) return true
    // 192.168.0.0/16 (RFC 1918)
    if (first == 192 && second == 168) return true
    // 169.254.0.0/16 (Link-Local)
    if (first == 169 && second == 254) return true

    return false
}

private fun buildCompanionUrl(hostInput: String, portInput: String): String? {
    val rawHost = hostInput.trim()
    val port = portInput.toIntOrNull()?.takeIf { it in 1..65535 } ?: return null
    val candidate = if ("://" in rawHost) rawHost else "http://$rawHost"
    val parsed = Uri.parse(candidate)
    if (parsed.scheme !in setOf("http", "https") || parsed.host.isNullOrBlank() || parsed.userInfo != null ||
        !parsed.query.isNullOrEmpty() || !parsed.fragment.isNullOrEmpty() || (parsed.path != null && parsed.path != "" && parsed.path != "/")
    ) return null
    if (parsed.scheme == "http" && !isPrivateOrLoopbackHost(parsed.host ?: "")) return null
    return Uri.Builder().scheme(parsed.scheme).encodedAuthority("${parsed.host}:$port").path(COMPANION_PATH).build().toString()
}

private fun buildOrigin(hostInput: String, portInput: String): String? {
    val rawHost = hostInput.trim()
    val port = portInput.toIntOrNull()?.takeIf { it in 1..65535 } ?: return null
    if (rawHost.isBlank() || rawHost.contains("://") || rawHost.contains('/') || rawHost.contains('@')) return null
    val parsed = Uri.parse("http://$rawHost")
    if (parsed.host.isNullOrBlank() || parsed.userInfo != null || parsed.path != null && parsed.path != "") return null
    if (!isPrivateOrLoopbackHost(parsed.host ?: "")) return null
    return Uri.Builder().scheme("http").encodedAuthority("${parsed.host}:$port").build().toString()
}

private data class LanPairResult(val sessionToken: String, val deviceId: String)
private data class LanPairQr(val token: String, val lanIps: List<String>, val port: Int)

private fun parseLanPairQr(payload: String, nowUnixSeconds: Long = System.currentTimeMillis() / 1000): Result<LanPairQr> = runCatching {
    val json = JSONObject(payload)
    require(json.optString("type") == "horizontuner-pair")
    require(json.optInt("version", -1) == 1)
    val token = json.optString("token")
    require(token.matches(Regex("[0-9A-F]{10}")))
    val port = json.optInt("port", -1)
    require(port in 1..65535)
    val expiresAt = json.optLong("expires_at_unix", -1)
    require(expiresAt > nowUnixSeconds) { "QR 碼已過期，請重新產生" }
    val ipsJson = json.optJSONArray("lan_ips") ?: error("QR 碼缺少 LAN 位址")
    val ips = (0 until ipsJson.length()).map { index ->
        val ip = ipsJson.optString(index)
        require(isValidIpv4(ip) && isPrivateOrLoopbackHost(ip)) { "QR 碼包含非區域網路位址" }
        ip
    }.distinct()
    require(ips.isNotEmpty())
    LanPairQr(token, ips, port)
}

private fun isValidIpv4(value: String): Boolean {
    val octets = value.split('.')
    return octets.size == 4 && octets.all { octet ->
        octet.isNotEmpty() && (octet == "0" || !octet.startsWith('0')) && octet.all(Char::isDigit) && octet.toIntOrNull()?.let { it in 0..255 } == true
    }
}

private fun performLanPair(origin: String, pairingToken: String, priorDeviceId: String): Result<LanPairResult> = runCatching {
    val deviceId = priorDeviceId.ifBlank { UUID.randomUUID().toString() }
    val connection = (URL("$origin/api/companion/pair").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 8000
        readTimeout = 8000
        doOutput = true
        setRequestProperty("Content-Type", "application/json; charset=utf-8")
    }
    try {
        val body = JSONObject()
            .put("token", pairingToken)
            .put("device_name", android.os.Build.MODEL ?: "Android Companion")
            .put("device_id", deviceId)
            .toString()
        connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body) }
        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val responseText = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        if (status !in 200..299) {
            val detail = runCatching { JSONObject(responseText).optString("detail").ifBlank { JSONObject(responseText).optString("error") } }.getOrNull()
            throw IllegalStateException(detail?.takeIf(String::isNotBlank) ?: "HTTP $status")
        }
        val response = JSONObject(responseText)
        val session = response.optString("session_token")
        check(session.isNotBlank()) { "配對回應缺少 session_token" }
        val device = response.opt("device")
        val returnedId = when (device) {
            is JSONObject -> device.optString("device_id").ifBlank { device.optString("id") }
            is String -> device
            else -> ""
        }
        LanPairResult(session, returnedId.ifBlank { deviceId })
    } finally {
        connection.disconnect()
    }
}
