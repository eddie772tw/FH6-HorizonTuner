package org.horizontuner.companion.app

import android.annotation.SuppressLint
import android.Manifest
import android.content.pm.PackageManager
import android.content.Intent
import android.content.Context
import android.net.Uri
import android.os.Build
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
    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* handled */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        autoConnect.value = intent.getBooleanExtra("companionAutoConnect", false)
        enableEdgeToEdge()
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContent {
            HalfmoonTheme(darkTheme = true) {
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
    var manualLanExpanded by remember { mutableStateOf(false) }
    var offlinePage by remember { mutableStateOf(OfflinePage.CONNECTION) }
    var desktopOnline by remember { mutableStateOf(false) }
    var backendOnline by remember { mutableStateOf(false) }
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
            errorMessage = "請輸入有效的 HTTP(S) 主機與 1-65535 連接埠（僅限區域網路或本機位址）"
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
        desktopOnline = false
        backendOnline = false
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
        val selectedMode = if (value.equals("LAN", ignoreCase = true)) ConnectionMode.LAN else ConnectionMode.USB
        if (selectedMode != mode && requestedUrl != null) {
            disconnect()
            offlinePage = OfflinePage.CONNECTION
        } else if (selectedMode != mode) {
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
        publishStatus()
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

    LaunchedEffect(offlinePage, state, webView) {
        if (state == WebConnectionState.CONNECTED && offlinePage != OfflinePage.CONNECTION) {
            webView?.let { publishNativeTab(it, offlinePage) }
        }
    }

    LaunchedEffect(requestedUrl, webView) {
        val endpoint = requestedUrl
        val view = webView
        if (endpoint != null && view != null && view.tag != endpoint) {
            view.tag = endpoint
            view.loadUrl(endpoint)
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
            webConnected = requestedUrl != null && state == WebConnectionState.CONNECTED,
            isDevMode = BuildConfig.DEBUG,
        ),
        actions = CompanionShellActions(
            selectPage = { offlinePage = it },
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
        if (requestedUrl != null || webView != null) AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
                WebView(context).also { view ->
                    view.addJavascriptInterface(CompanionJavascriptBridge(nativeStatusJson, connect, disconnect, ::selectMode, ::loadLanSession, ::reconnectLan, ::requestQrScanner, { desktopOnline = it }, { backendOnline = it }), "HorizonTunerCompanion")
                    configureWebView(view, {
                        state = WebConnectionState.CONNECTED
                        errorMessage = null
                        if (offlinePage == OfflinePage.CONNECTION) offlinePage = OfflinePage.TELEMETRY
                        publishStatus(null)
                        onServiceStart()
                    }, { message ->
                        state = WebConnectionState.ERROR
                        desktopOnline = false
                        backendOnline = false
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

internal enum class WebConnectionState { DISCONNECTED, LOADING, CONNECTED, ERROR }
internal enum class ConnectionMode { LAN, USB }
internal enum class OfflinePage(val label: String) { TELEMETRY("Telemetry"), TUNING("Tuning"), CONNECTION("Connection") }

private class CompanionJavascriptBridge(
    private val status: AtomicReference<String>,
    private val onConnect: (String, String) -> Unit,
    private val onDisconnect: () -> Unit,
    private val onSetMode: (String) -> Unit,
    private val onPairLan: (String, String, String) -> Unit,
    private val onConnectLan: () -> Unit,
    private val onScanLanQr: () -> Unit,
    private val onDesktopStatus: (Boolean) -> Unit,
    private val onBackendStatus: (Boolean) -> Unit,
) {
    @JavascriptInterface fun connectionStatus(): String = status.get()
    @JavascriptInterface fun connect(host: String, port: String) { Handler(Looper.getMainLooper()).post { onConnect(host, port) } }
    @JavascriptInterface fun disconnect() { Handler(Looper.getMainLooper()).post { onDisconnect() } }
    @JavascriptInterface fun setMode(mode: String) { Handler(Looper.getMainLooper()).post { onSetMode(mode) } }
    @JavascriptInterface fun pairLan(host: String, port: String, token: String) { Handler(Looper.getMainLooper()).post { onPairLan(host, port, token) } }
    @JavascriptInterface fun connectLan() { Handler(Looper.getMainLooper()).post { onConnectLan() } }
    @JavascriptInterface fun scanLanQr() { Handler(Looper.getMainLooper()).post { onScanLanQr() } }
    @JavascriptInterface fun updateDesktopStatus(online: Boolean) { Handler(Looper.getMainLooper()).post { onDesktopStatus(online) } }
    @JavascriptInterface fun updateBackendStatus(online: Boolean) { Handler(Looper.getMainLooper()).post { onBackendStatus(online) } }
}

private fun publishNativeTab(view: WebView, page: OfflinePage) {
    val tab = if (page == OfflinePage.TUNING) "tuning" else "telemetry"
    view.post { view.evaluateJavascript("window.dispatchEvent(new CustomEvent('companion-native-tab', {detail:'$tab'}))", null) }
}

private fun connectionStatusJson(state: WebConnectionState, mode: ConnectionMode, host: String, port: String, error: String?, paired: Boolean): String =
    JSONObject().put("state", state.name).put("mode", mode.name).put("paired", paired).put("host", host).put("port", port).put("error", error).toString()

private fun publishConnectionStatus(view: WebView, state: WebConnectionState, mode: ConnectionMode, host: String, port: String, error: String?, paired: Boolean) {
    val json = connectionStatusJson(state, mode, host, port, error, paired)
    view.post { view.evaluateJavascript("window.dispatchEvent(new CustomEvent('companion-native-connection', {detail:$json}))", null) }
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
            if (request.isForMainFrame && sameDocument(request.url, requestedUrl())) {
                mainFrameLoadFailed = true
                onLoadError("無法載入 PC Companion：${error.description}")
            }
        }

        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: android.webkit.WebResourceResponse) {
            if (request.isForMainFrame && sameDocument(request.url, requestedUrl())) {
                mainFrameLoadFailed = true
                onLoadError("PC Companion 回傳 HTTP ${response.statusCode}")
            }
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: android.net.http.SslError) {
            handler.cancel()
            if (sameDocument(Uri.parse(error.url), requestedUrl())) onLoadError("TLS 憑證驗證失敗")
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
