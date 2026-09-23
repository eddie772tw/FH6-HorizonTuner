package org.horizontuner.companion.app

import android.annotation.SuppressLint
import android.Manifest
import android.content.pm.PackageManager
import android.content.Intent
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.SslErrorHandler
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.CookieManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import android.os.Handler
import android.os.Looper
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

private const val COMPANION_PATH = "/companion/index.html"
private const val PAIRING_PREFS = "companion_lan_session"

class MainActivity : ComponentActivity() {
    private val autoConnect = mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        autoConnect.value = intent.getBooleanExtra("companionAutoConnect", false)
        enableEdgeToEdge()
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContent {
            HalfmoonTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    CompanionAppContent(::startTelemetryService, ::stopTelemetryService, autoConnect.value) { autoConnect.value = false }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        autoConnect.value = intent.getBooleanExtra("companionAutoConnect", false)
    }

    private fun startTelemetryService() {
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
    var webView by remember { mutableStateOf<WebView?>(null) }
    var showQrScanner by remember { mutableStateOf(false) }
    var offlinePage by remember { mutableStateOf(OfflinePage.CONNECTION) }
    val nativeStatusJson = remember { AtomicReference(connectionStatusJson(state, mode, host, port, errorMessage, sessionToken.isNotBlank())) }
    val scope = rememberCoroutineScope()
    fun publishStatus(error: String? = errorMessage) {
        nativeStatusJson.set(connectionStatusJson(state, mode, host, port, error, sessionToken.isNotBlank()))
        webView?.let { publishConnectionStatus(it, state, mode, host, port, error, sessionToken.isNotBlank()) }
    }

    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) showQrScanner = true else {
            errorMessage = "需要相機權限才能掃描配對 QR 碼"
            publishStatus(errorMessage)
        }
    }

    fun requestQrScanner() {
        if (ContextCompat.checkSelfPermission(appContext, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            showQrScanner = true
        } else cameraPermission.launch(Manifest.permission.CAMERA)
    }

    val connect: (String, String) -> Unit = { inputHost, inputPort ->
        mode = ConnectionMode.USB
        host = inputHost
        port = inputPort
        val endpoint = buildCompanionUrl(inputHost, inputPort)
        if (endpoint == null) {
            state = WebConnectionState.ERROR
            offlinePage = OfflinePage.CONNECTION
            errorMessage = "請輸入有效的 HTTP(S) 主機與 1-65535 連接埠"
            publishStatus(errorMessage)
        } else {
            requestedUrl = endpoint
            errorMessage = null
            state = WebConnectionState.LOADING
            publishStatus(null)
            webView?.let { it.tag = endpoint }
            webView?.loadUrl(endpoint)
        }
    }
    val disconnect: () -> Unit = {
        webView?.stopLoading()
        webView?.loadUrl("about:blank")
        onServiceStop()
        requestedUrl = null
        errorMessage = null
        state = WebConnectionState.DISCONNECTED
        offlinePage = OfflinePage.TELEMETRY
        publishStatus(null)
        Unit
    }

    fun pairLanCandidates(targetHosts: List<String>, targetPort: String, token: String) {
        val candidates = targetHosts.mapNotNull { candidate -> buildOrigin(candidate, targetPort)?.let { candidate.trim() to it } }
        if (candidates.isEmpty() || token.isBlank()) {
            errorMessage = "請輸入有效的 LAN 主機、連接埠與配對碼"
            state = WebConnectionState.ERROR
            publishStatus(errorMessage)
            return
        }
        mode = ConnectionMode.LAN
        host = candidates.first().first
        port = targetPort.trim()
        state = WebConnectionState.LOADING
        errorMessage = "正在透過 LAN 配對…"
        publishStatus(errorMessage)
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
            result.fold(
                onSuccess = { (successfulHost, paired) ->
                    val origin = buildOrigin(successfulHost, targetPort) ?: return@fold
                    sessionToken = paired.sessionToken
                    deviceId = paired.deviceId
                    pairedHost = successfulHost
                    pairedPort = targetPort.trim()
                    publishStatus(null)
                    preferences.edit()
                        .putString("session_token", sessionToken)
                        .putString("device_id", deviceId)
                        .putString("host", pairedHost)
                        .putString("port", pairedPort)
                        .apply()
                    setSessionCookie(origin, sessionToken) { cookieSet ->
                        if (!cookieSet) {
                            state = WebConnectionState.ERROR
                            errorMessage = "LAN 配對成功，但無法設定 WebView 工作階段"
                            publishStatus(errorMessage)
                        } else {
                            requestedUrl = "$origin$COMPANION_PATH"
                            errorMessage = null
                            webView?.let { it.tag = requestedUrl; it.loadUrl(requestedUrl!!) }
                            publishStatus(null)
                        }
                    }
                },
                onFailure = { failure ->
                    state = WebConnectionState.ERROR
                    errorMessage = "LAN 配對失敗：${failure.message ?: "連線錯誤"}"
                    publishStatus(errorMessage)
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
            publishStatus(errorMessage)
            return
        }
        mode = ConnectionMode.LAN
        host = pairedHost
        port = pairedPort
        val origin = buildOrigin(host, port)
        if (origin == null) {
            errorMessage = "已儲存的 LAN 位址無效，請重新配對"
            state = WebConnectionState.ERROR
            publishStatus(errorMessage)
            return
        }
        state = WebConnectionState.LOADING
        errorMessage = null
        publishStatus(null)
        setSessionCookie(origin, sessionToken) { cookieSet ->
            if (!cookieSet) {
                state = WebConnectionState.ERROR
                errorMessage = "無法恢復 LAN 工作階段，請重新配對"
                publishStatus(errorMessage)
            } else {
                val endpoint = "$origin$COMPANION_PATH"
                requestedUrl = endpoint
                webView?.let { it.tag = endpoint; it.loadUrl(endpoint) }
            }
        }
    }

    fun selectMode(value: String) {
        mode = if (value.equals("LAN", ignoreCase = true)) ConnectionMode.LAN else ConnectionMode.USB
        if (mode == ConnectionMode.USB) {
            host = "127.0.0.1"
            port = "8001"
        } else if (pairedHost.isNotBlank()) {
            host = pairedHost
            port = pairedPort
        }
        publishStatus()
    }

    BackHandler(enabled = requestedUrl == null && offlinePage == OfflinePage.CONNECTION) {
        offlinePage = OfflinePage.TELEMETRY
    }
    BackHandler(enabled = requestedUrl != null && state == WebConnectionState.LOADING) {
        disconnect()
    }

    LaunchedEffect(autoConnect, webView) {
        if (autoConnect && webView != null) {
            mode = ConnectionMode.USB
            host = "127.0.0.1"
            port = "8001"
            connect(host, port)
            onAutoConnectHandled()
        }
    }

    Box(modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
                WebView(context).also { view ->
                    view.addJavascriptInterface(CompanionJavascriptBridge(nativeStatusJson, connect, disconnect, ::selectMode, ::loadLanSession, ::reconnectLan, ::requestQrScanner), "HorizonTunerCompanion")
                    configureWebView(view, {
                        state = WebConnectionState.CONNECTED
                        errorMessage = null
                        publishStatus(null)
                        onServiceStart()
                    }, { message ->
                        state = WebConnectionState.ERROR
                        offlinePage = OfflinePage.CONNECTION
                        errorMessage = message
                        requestedUrl = null
                        publishStatus(message)
                        onServiceStop()
                    }, { requestedUrl }, { })
                    webView = view
                }
            },
            update = { webView = it },
        )

        if (requestedUrl == null) {
            Column(
                modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("FH6 HorizonTuner Companion", style = MaterialTheme.typography.headlineSmall)
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(OfflinePage.TELEMETRY, OfflinePage.TUNING, OfflinePage.CONNECTION).forEach { page ->
                        if (page == offlinePage) {
                            Button(onClick = { offlinePage = page }, modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp)) {
                                Text(page.label, style = MaterialTheme.typography.labelMedium)
                            }
                        } else {
                            OutlinedButton(onClick = { offlinePage = page }, modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp)) {
                                Text(page.label, style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }
                }
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (offlinePage == OfflinePage.CONNECTION) {
                            Text("連線模式")
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                                if (mode == ConnectionMode.USB) Button(onClick = { selectMode("USB") }, modifier = Modifier.weight(1f)) { Text("USB 除錯") }
                                else OutlinedButton(onClick = { selectMode("USB") }, modifier = Modifier.weight(1f)) { Text("USB 除錯") }
                                if (mode == ConnectionMode.LAN) Button(onClick = { selectMode("LAN") }, modifier = Modifier.weight(1f)) { Text("區域網路") }
                                else OutlinedButton(onClick = { selectMode("LAN") }, modifier = Modifier.weight(1f)) { Text("區域網路") }
                            }
                            Text(connectionLabel(state), color = MaterialTheme.colorScheme.onSurface)
                            OutlinedTextField(host, { host = it }, label = { Text(if (mode == ConnectionMode.LAN) "PC LAN IP or host" else "USB forwarded host") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            OutlinedTextField(port, { port = it.filter(Char::isDigit).take(5) }, label = { Text("Port") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            if (mode == ConnectionMode.LAN) {
                                OutlinedTextField(pairingToken, { pairingToken = it }, label = { Text("桌面端配對碼") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                                OutlinedButton(onClick = ::requestQrScanner, enabled = state != WebConnectionState.LOADING, modifier = Modifier.fillMaxWidth()) { Text("掃描 QR") }
                                if (sessionToken.isNotBlank()) Text("已配對裝置：${deviceId.ifBlank { "Companion" }}", color = MaterialTheme.colorScheme.onSurface)
                            }
                            errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (mode == ConnectionMode.USB) {
                                    Button(onClick = { connect(host, port) }, enabled = state != WebConnectionState.LOADING, modifier = Modifier.weight(1f)) {
                                        Text(if (state == WebConnectionState.ERROR) "重試 USB" else "連接 USB")
                                    }
                                } else {
                                    Button(onClick = { loadLanSession(host, port, pairingToken) }, enabled = state != WebConnectionState.LOADING && pairingToken.isNotBlank(), modifier = Modifier.weight(1f)) { Text("配對並連線") }
                                    OutlinedButton(onClick = { reconnectLan() }, enabled = state != WebConnectionState.LOADING && sessionToken.isNotBlank(), modifier = Modifier.weight(1f)) { Text("重新連線") }
                                }
                            }
                            OutlinedButton(onClick = { offlinePage = OfflinePage.TELEMETRY }, modifier = Modifier.fillMaxWidth()) {
                                    Text("返回主畫面")
                            }
                        } else {
                            Text(offlinePage.label, style = MaterialTheme.typography.titleLarge)
                            Text("PC Companion 尚未連線，${offlinePage.label} 暫時無法取得資料。", color = MaterialTheme.colorScheme.onSurface)
                            Button(onClick = { offlinePage = OfflinePage.CONNECTION }, modifier = Modifier.fillMaxWidth()) {
                                Text("連線設定")
                            }
                        }
                    }
                }
            }
        }
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
            webView?.let { view ->
                onServiceStop()
                view.stopLoading()
                view.webViewClient = WebViewClient()
                (view.parent as? ViewGroup)?.removeView(view)
                view.destroy()
            }
        }
    }
}

private enum class WebConnectionState { DISCONNECTED, LOADING, CONNECTED, ERROR }
private enum class ConnectionMode { LAN, USB }
private enum class OfflinePage(val label: String) { TELEMETRY("Telemetry"), TUNING("Tuning"), CONNECTION("Connection") }

private class CompanionJavascriptBridge(
    private val status: AtomicReference<String>,
    private val onConnect: (String, String) -> Unit,
    private val onDisconnect: () -> Unit,
    private val onSetMode: (String) -> Unit,
    private val onPairLan: (String, String, String) -> Unit,
    private val onConnectLan: () -> Unit,
    private val onScanLanQr: () -> Unit,
) {
    @JavascriptInterface fun connectionStatus(): String = status.get()
    @JavascriptInterface fun connect(host: String, port: String) { Handler(Looper.getMainLooper()).post { onConnect(host, port) } }
    @JavascriptInterface fun disconnect() { Handler(Looper.getMainLooper()).post { onDisconnect() } }
    @JavascriptInterface fun setMode(mode: String) { Handler(Looper.getMainLooper()).post { onSetMode(mode) } }
    @JavascriptInterface fun pairLan(host: String, port: String, token: String) { Handler(Looper.getMainLooper()).post { onPairLan(host, port, token) } }
    @JavascriptInterface fun connectLan() { Handler(Looper.getMainLooper()).post { onConnectLan() } }
    @JavascriptInterface fun scanLanQr() { Handler(Looper.getMainLooper()).post { onScanLanQr() } }
}

private fun connectionStatusJson(state: WebConnectionState, mode: ConnectionMode, host: String, port: String, error: String?, paired: Boolean): String =
    JSONObject().put("state", state.name).put("mode", mode.name).put("paired", paired).put("host", host).put("port", port).put("error", error).toString()

private fun publishConnectionStatus(view: WebView, state: WebConnectionState, mode: ConnectionMode, host: String, port: String, error: String?, paired: Boolean) {
    val json = connectionStatusJson(state, mode, host, port, error, paired)
    view.post { view.evaluateJavascript("window.dispatchEvent(new CustomEvent('companion-native-connection', {detail:$json}))", null) }
}

private fun connectionLabel(state: WebConnectionState): String = when (state) {
    WebConnectionState.DISCONNECTED -> "未連線"
    WebConnectionState.LOADING -> "載入 PC Companion…"
    WebConnectionState.CONNECTED -> "PC Companion 介面已載入"
    WebConnectionState.ERROR -> "連線失敗"
}

private fun buildCompanionUrl(hostInput: String, portInput: String): String? {
    val rawHost = hostInput.trim()
    val port = portInput.toIntOrNull()?.takeIf { it in 1..65535 } ?: return null
    val candidate = if ("://" in rawHost) rawHost else "http://$rawHost"
    val parsed = Uri.parse(candidate)
    if (parsed.scheme !in setOf("http", "https") || parsed.host.isNullOrBlank() || parsed.userInfo != null ||
        !parsed.query.isNullOrEmpty() || !parsed.fragment.isNullOrEmpty() || (parsed.path != null && parsed.path != "" && parsed.path != "/")
    ) return null
    return Uri.Builder().scheme(parsed.scheme).encodedAuthority("${parsed.host}:$port").path(COMPANION_PATH).build().toString()
}

private fun buildOrigin(hostInput: String, portInput: String): String? {
    val rawHost = hostInput.trim()
    val port = portInput.toIntOrNull()?.takeIf { it in 1..65535 } ?: return null
    if (rawHost.isBlank() || rawHost.contains("://") || rawHost.contains('/') || rawHost.contains('@')) return null
    val parsed = Uri.parse("http://$rawHost")
    if (parsed.host.isNullOrBlank() || parsed.userInfo != null || parsed.path != null && parsed.path != "") return null
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
        require(isValidIpv4(ip))
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

private fun setSessionCookie(origin: String, sessionToken: String, complete: (Boolean) -> Unit) {
    val manager = CookieManager.getInstance()
    manager.setAcceptCookie(true)
    val cookie = "companion_session=$sessionToken; Path=/; HttpOnly; SameSite=Strict"
    manager.setCookie(origin, cookie) { accepted ->
        manager.flush()
        Handler(Looper.getMainLooper()).post { complete(accepted) }
    }
}

@SuppressLint("SetJavaScriptEnabled")
private fun configureWebView(view: WebView, onPageLoaded: () -> Unit, onLoadError: (String) -> Unit, requestedUrl: () -> String?, onLoadStarted: () -> Unit) {
    view.keepScreenOn = true
    if ((view.context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
        WebView.setWebContentsDebuggingEnabled(true)
    }
    view.settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        allowFileAccess = false
        allowContentAccess = false
        setSupportMultipleWindows(false)
        javaScriptCanOpenWindowsAutomatically = false
        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
    }
    var mainFrameLoadFailed = false
    view.webViewClient = object : WebViewClient() {
        override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
            if (sameDocument(Uri.parse(url), requestedUrl())) {
                mainFrameLoadFailed = false
                onLoadStarted()
            }
        }

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = !sameOrigin(request.url, requestedUrl())

        override fun onPageFinished(view: WebView, url: String) {
            if (!mainFrameLoadFailed && sameDocument(Uri.parse(url), requestedUrl())) onPageLoaded()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) {
                mainFrameLoadFailed = true
                onLoadError("無法載入 PC Companion：${error.description}")
            }
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: android.webkit.WebResourceResponse) {
            if (request.isForMainFrame) {
                mainFrameLoadFailed = true
                onLoadError("PC Companion 回傳 HTTP ${response.statusCode}")
            }
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: android.net.http.SslError) {
            handler.cancel()
            onLoadError("TLS 憑證驗證失敗")
        }
    }
}

private fun sameOrigin(candidate: Uri, expectedUrl: String?): Boolean {
    val expected = expectedUrl?.let(Uri::parse) ?: return false
    return candidate.scheme == expected.scheme && candidate.host == expected.host && candidate.port == expected.port
}

private fun sameDocument(candidate: Uri, expectedUrl: String?): Boolean {
    val expected = expectedUrl?.let(Uri::parse) ?: return false
    return sameOrigin(candidate, expectedUrl) && candidate.path == expected.path &&
        candidate.query == expected.query && candidate.fragment == expected.fragment
}
