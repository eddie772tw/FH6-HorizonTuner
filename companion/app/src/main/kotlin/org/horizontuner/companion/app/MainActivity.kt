package org.horizontuner.companion.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.SslErrorHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.safeDrawing
import org.horizontuner.companion.app.service.TelemetryForegroundService
import org.horizontuner.companion.theme.HalfmoonTheme

private const val COMPANION_PATH = "/companion/index.html"

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
    var host by remember { mutableStateOf("127.0.0.1") }
    var port by remember { mutableStateOf("8001") }
    var state by remember { mutableStateOf(WebConnectionState.DISCONNECTED) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var requestedUrl by remember { mutableStateOf<String?>(null) }
    var webView by remember { mutableStateOf<WebView?>(null) }
    var showSettings by remember { mutableStateOf(true) }

    val connect = {
        val endpoint = buildCompanionUrl(host, port)
        if (endpoint == null) {
            state = WebConnectionState.ERROR
            errorMessage = "請輸入有效的 HTTP(S) 主機與 1-65535 連接埠"
        } else {
            requestedUrl = endpoint
            errorMessage = null
            state = WebConnectionState.LOADING
            showSettings = false
            webView?.let { it.tag = endpoint }
            webView?.loadUrl(endpoint)
        }
    }
    val disconnect = {
        webView?.stopLoading()
        webView?.loadUrl("about:blank")
        onServiceStop()
        requestedUrl = null
        errorMessage = null
        state = WebConnectionState.DISCONNECTED
        showSettings = true
    }

    LaunchedEffect(autoConnect, webView) {
        if (autoConnect && webView != null) {
            host = "127.0.0.1"
            port = "8001"
            connect()
            onAutoConnectHandled()
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (state == WebConnectionState.DISCONNECTED || showSettings) {
            Text("FH6 HorizonTuner Companion", style = MaterialTheme.typography.headlineSmall)
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(connectionLabel(state), color = MaterialTheme.colorScheme.onSurface)
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(host, { host = it }, label = { Text("Host or HTTP(S) URL") }, singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(port, { port = it.filter(Char::isDigit).take(5) }, label = { Text("Port") }, singleLine = true, modifier = Modifier.weight(0.42f))
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { connect() }, enabled = state != WebConnectionState.LOADING, modifier = Modifier.weight(1f)) {
                            Text(if (state == WebConnectionState.ERROR) "Retry" else "Connect")
                        }
                        Button(onClick = disconnect, enabled = state != WebConnectionState.DISCONNECTED, modifier = Modifier.weight(1f)) {
                            Text("Disconnect")
                        }
                    }
                    errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            }
        } else {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(connectionLabel(state), color = MaterialTheme.colorScheme.onSurface)
                Button(onClick = { showSettings = true }) { Text("Connection settings") }
            }
        }
        AndroidView(
            modifier = Modifier.fillMaxWidth().weight(1f),
            factory = { context ->
                WebView(context).also { view ->
                    configureWebView(view, { state = WebConnectionState.CONNECTED; errorMessage = null; showSettings = false; onServiceStart() }, { message ->
                        state = WebConnectionState.ERROR; errorMessage = message; showSettings = true; onServiceStop()
                    }, { requestedUrl }, { })
                    webView = view
                }
            },
            update = { webView = it },
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
