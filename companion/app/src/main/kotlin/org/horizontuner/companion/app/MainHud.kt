package org.horizontuner.companion.app

import android.annotation.SuppressLint
import android.graphics.Color
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.CancellationException
import org.horizontuner.companion.core.hud.*
import org.horizontuner.companion.theme.InstrumentColors
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File

private const val HUD_ORIGIN = "https://companion.invalid"

/** Native controls consume the PC catalog. Only a verified, complete cached revision can render. */
@Composable
internal fun MainHud(session: NativeSession, frame: JSONObject?, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val preferences = remember { context.getSharedPreferences("companion_instrument", 0) }
    val originKey = remember(session.origin) { InstrumentProtocol.sha256(session.origin.toByteArray()) }
    val repository = remember(session) { HostInstruments(File(context.filesDir, "instrument-cache"), session) }
    var catalog by remember(session) { mutableStateOf<InstrumentCatalog?>(null) }
    var selectedId by remember(session) { mutableStateOf(preferences.getString(originKey, null)) }
    var cached by remember(session) { mutableStateOf<CachedInstrument?>(null) }
    var expanded by remember { mutableStateOf(false) }
    var refresh by remember { mutableIntStateOf(0) }
    var status by remember(session) { mutableStateOf("正在取得主程式儀表清單…") }
    var catalogIsCached by remember(session) { mutableStateOf(false) }
    var catalogLoading by remember(session) { mutableStateOf(true) }
    LaunchedEffect(repository, refresh) {
        catalogLoading = true
        try {
            val (next, offline) = repository.catalog()
            catalog = next
            catalogIsCached = offline
            if (next.styles.none { it.id == selectedId }) selectedId = next.styles.firstOrNull()?.id
            if (next.styles.isEmpty()) status = "主程式尚未提供可用的主儀表"
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) { status = "無法取得儀表清單，請確認主程式版本與連線後重試。" }
        finally { catalogLoading = false }
    }
    val selected = catalog?.styles?.find { it.id == selectedId }
    LaunchedEffect(repository, selected, refresh, catalogLoading) {
        if (catalogLoading) return@LaunchedEffect
        cached = null
        val style = selected ?: return@LaunchedEffect
        status = "首次使用或版本更新時，會下載並驗證儀表快取…"
        try {
            val (pack, offline) = repository.instrument(style)
            cached = pack
            status = if (offline || catalogIsCached) "無法更新，使用已驗證的快取版本" else "儀表快取已就緒"
            preferences.edit().putString(originKey, style.id).apply()
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) { status = "儀表尚未準備完成，請檢查連線並重試。既有快取已保留。" }
    }
    Column(modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Box(Modifier.weight(1f)) {
                TextButton(enabled = catalog?.styles?.isNotEmpty() == true, onClick = { expanded = true }) { Text("主儀表：${selected?.label ?: "等待清單"} ▾") }
                DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    catalog?.styles?.forEach { style ->
                        DropdownMenuItem(text = { Text(style.label) }, onClick = { selectedId = style.id; expanded = false })
                    }
                }
            }
            TextButton(onClick = { refresh++ }) { Text("更新／重試") }
        }
        val pack = cached
        if (pack == null) Text(status, modifier = Modifier.padding(12.dp), style = MaterialTheme.typography.bodySmall)
        else {
            if (catalogIsCached || selected?.revision != pack.manifest.revision) Text(status, style = MaterialTheme.typography.labelSmall)
            key(pack.directory.absolutePath) { CachedHudSurface(pack, frame, Modifier.fillMaxWidth().weight(1f)) }
        }
    }
}

/** Local renderer has no JavaScript bridge, file/content access, external navigation or network. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun CachedHudSurface(pack: CachedInstrument, frame: JSONObject?, modifier: Modifier) {
    var view by remember { mutableStateOf<WebView?>(null) }
    val files = remember(pack) { pack.manifest.assets.associateBy { it.path } }
    Box(modifier.heightIn(min = 100.dp).background(InstrumentColors.background)) {
        AndroidView(modifier = Modifier.fillMaxSize(), factory = { context ->
            WebView(context).apply {
                setBackgroundColor(Color.TRANSPARENT)
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.setSupportZoom(false)
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = request.url.scheme != "https" || request.url.host != "companion.invalid"
                    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                        val uri = request.url
                        val path = uri.path.orEmpty().removePrefix("/hud/")
                        if (uri.scheme != "https" || uri.host != "companion.invalid" || !files.containsKey(path)) return failure(403)
                        val mime = when (path.substringAfterLast('.')) {
                            "html" -> "text/html"; "js" -> "text/javascript"; "json" -> "application/json"
                            "css" -> "text/css"; "svg" -> "image/svg+xml"; "png" -> "image/png"; "jpg", "jpeg" -> "image/jpeg"
                            "woff" -> "font/woff"; "woff2" -> "font/woff2"; "ttf" -> "font/ttf"; "otf" -> "font/otf"
                            else -> "application/octet-stream"
                        }
                        return runCatching { WebResourceResponse(mime, null, File(pack.directory, path).inputStream()) }.getOrElse { failure(404) }
                    }
                }
                view = this
            }
        }, onRelease = { it.stopLoading(); it.destroy(); if (view === it) view = null })
    }
    LaunchedEffect(view) { view?.loadUrl("$HUD_ORIGIN/hud/shared/companion.html?style=${pack.manifest.style}") }
    LaunchedEffect(view, frame) {
        if (frame != null) view?.evaluateJavascript("window.companionTelemetry?.(${frame});", null)
        view?.alpha = if (frame == null) 0f else 1f
    }
}

private fun failure(status: Int) = WebResourceResponse("text/plain", "UTF-8", status, if (status == 403) "Forbidden" else "Not Found", emptyMap(), ByteArrayInputStream(byteArrayOf()))
