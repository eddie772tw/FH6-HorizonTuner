package org.horizontuner.companion.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.horizontuner.companion.theme.HalfmoonBorder
import org.horizontuner.companion.theme.HalfmoonDarkBg
import org.horizontuner.companion.theme.HalfmoonDarkSurface
import org.horizontuner.companion.theme.HalfmoonDarkSurfaceVariant
import org.horizontuner.companion.theme.HalfmoonTextPrimary
import org.horizontuner.companion.theme.HalfmoonTextSecondary

private val ActionBlue = Color(0xFF0066FF)
private val TabCyan = Color(0xFF00F0FF)
private val ErrorRed = Color(0xFFDC3545)
private val WarningYellow = Color(0xFFFFC107)
private val SuccessGreen = Color(0xFF198754)
private val PanelShape = RoundedCornerShape(12.dp)
private val ControlShape = RoundedCornerShape(8.dp)

internal data class CompanionShellState(
    val page: OfflinePage,
    val mode: ConnectionMode,
    val host: String,
    val port: String,
    val pairingToken: String,
    val paired: Boolean,
    val deviceId: String,
    val connection: WebConnectionState,
    val desktopOnline: Boolean,
    val backendOnline: Boolean,
    val error: String?,
    val manualLanExpanded: Boolean,
    val webConnected: Boolean,
)

internal data class CompanionShellActions(
    val selectPage: (OfflinePage) -> Unit,
    val selectMode: (ConnectionMode) -> Unit,
    val setHost: (String) -> Unit,
    val setPort: (String) -> Unit,
    val setPairingToken: (String) -> Unit,
    val scanQr: () -> Unit,
    val reconnectLan: () -> Unit,
    val pairLan: () -> Unit,
    val connectUsb: () -> Unit,
    val disconnect: () -> Unit,
    val toggleManualLan: () -> Unit,
)

/** The Android-owned shell stays mounted before and after WebView connects. */
@Composable
internal fun CompanionShell(
    state: CompanionShellState,
    actions: CompanionShellActions,
    webContent: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().background(HalfmoonDarkBg).windowInsetsPadding(WindowInsets.safeDrawing),
    ) {
        ShellTabs(state, actions.selectPage)
        Box(modifier = Modifier.fillMaxWidth().weight(1f)) {
            webContent()
            if (state.page == OfflinePage.CONNECTION || !state.webConnected) {
                if (state.page == OfflinePage.CONNECTION) ConnectionPage(state, actions)
                else OfflinePageContent(state.page, actions.selectPage)
            }
        }
    }
}

@Composable
private fun ShellTabs(state: CompanionShellState, onSelect: (OfflinePage) -> Unit) {
    val (indicatorColor, _) = aggregateStatus(state)
    Row(
        modifier = Modifier.fillMaxWidth().background(Color(0xFF090909)).padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        listOf(OfflinePage.TELEMETRY, OfflinePage.TUNING, OfflinePage.CONNECTION).forEach { page ->
            val selected = page == state.page
            Button(
                onClick = { onSelect(page) },
                modifier = Modifier.weight(1f).heightIn(min = 38.dp),
                shape = ControlShape,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (selected) TabCyan else Color.Transparent,
                    contentColor = if (selected) HalfmoonDarkBg else HalfmoonTextSecondary,
                ),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 4.dp, vertical = 4.dp),
            ) {
                Text(page.label, fontSize = 14.sp)
                if (page == OfflinePage.CONNECTION) {
                    Spacer(Modifier.size(5.dp))
                    Box(Modifier.size(7.dp).background(indicatorColor, RoundedCornerShape(50)))
                }
            }
        }
    }
}

@Composable
private fun OfflinePageContent(page: OfflinePage, onSelect: (OfflinePage) -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().background(HalfmoonDarkBg).padding(12.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().background(HalfmoonDarkSurface, PanelShape)
                .border(1.dp, HalfmoonBorder, PanelShape).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(page.label, color = HalfmoonTextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            Text("PC Companion 尚未連線，${page.label} 暫時無法取得資料。", color = HalfmoonTextSecondary, fontSize = 14.sp)
            ShellButton("前往 Connection", onClick = { onSelect(OfflinePage.CONNECTION) }, primary = true, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun ConnectionPage(state: CompanionShellState, actions: CompanionShellActions) {
    Column(
        modifier = Modifier.fillMaxSize().background(HalfmoonDarkBg).verticalScroll(rememberScrollState()).padding(12.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().background(HalfmoonDarkSurface, PanelShape)
                .border(1.dp, HalfmoonBorder, PanelShape).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Connection", color = HalfmoonTextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            Text("選擇一般使用的區域網路，或選擇 USB 除錯連線。", color = HalfmoonTextSecondary, fontSize = 14.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ShellButton("Local network", onClick = { actions.selectMode(ConnectionMode.LAN) }, primary = state.mode == ConnectionMode.LAN)
                ShellButton("USB debugging", onClick = { actions.selectMode(ConnectionMode.USB) }, primary = state.mode == ConnectionMode.USB)
            }
            val (statusColor, statusText) = aggregateStatus(state)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(statusText, modifier = Modifier.background(statusColor, RoundedCornerShape(50)).padding(horizontal = 9.dp, vertical = 3.dp), color = if (statusColor == WarningYellow) Color.Black else Color.White, fontSize = 12.sp)
                Text("${state.host.ifBlank { "—" }}:${state.port.ifBlank { "—" }}", color = HalfmoonTextSecondary, fontSize = 13.sp)
            }
            if (state.mode == ConnectionMode.LAN) {
                Column(
                    modifier = Modifier.fillMaxWidth().background(HalfmoonDarkSurfaceVariant, ControlShape)
                        .border(1.dp, HalfmoonBorder, ControlShape).padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ShellButton("掃描 QR 並配對", onClick = actions.scanQr, primary = true, enabled = state.connection != WebConnectionState.LOADING, modifier = Modifier.fillMaxWidth(), tall = true)
                    Text("掃描桌面端產生的 QR 碼，會自動選擇可連線的 LAN 位址。", color = HalfmoonTextSecondary, fontSize = 13.sp)
                    if (state.paired) ShellButton("連接已配對的桌面端", onClick = actions.reconnectLan, primary = true, enabled = state.connection != WebConnectionState.LOADING)
                    if (state.webConnected) ShellButton("中斷連線", onClick = actions.disconnect)
                }
                ShellButton(
                    if (state.manualLanExpanded) "收起手動配對 ▴" else "進階選項 · 手動連線 ▾",
                    onClick = actions.toggleManualLan,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (state.manualLanExpanded) {
                    ShellField("PC local network address", state.host, actions.setHost)
                    ShellField("Port", state.port, actions.setPort)
                    ShellField("Pairing code", state.pairingToken, actions.setPairingToken)
                    ShellButton("手動配對並連線", onClick = actions.pairLan, enabled = state.connection != WebConnectionState.LOADING && state.pairingToken.isNotBlank())
                }
            } else {
                ShellField("USB forwarded host", state.host, actions.setHost)
                ShellField("Port", state.port, actions.setPort)
                ShellButton(if (state.connection == WebConnectionState.ERROR) "重試 USB" else "連接 USB", onClick = actions.connectUsb, primary = true, enabled = state.connection != WebConnectionState.LOADING)
                if (state.webConnected) ShellButton("中斷連線", onClick = actions.disconnect)
            }
            state.error?.let { Text(it, color = ErrorRed, fontSize = 13.sp) }
            if (!state.webConnected) ShellButton("返回主畫面", onClick = { actions.selectPage(OfflinePage.TELEMETRY) })
            Spacer(Modifier.heightIn(min = 24.dp))
            ConnectionDiagnostics(state)
        }
    }
}

@Composable
private fun ConnectionDiagnostics(state: CompanionShellState) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Connection diagnostics", color = HalfmoonTextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        Column(
            modifier = Modifier.fillMaxWidth().background(HalfmoonDarkSurfaceVariant, ControlShape)
                .border(1.dp, HalfmoonBorder, ControlShape).padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            DiagnosticLine("Mode", if (state.mode == ConnectionMode.LAN) "LAN" else "USB")
            DiagnosticLine("Address", "${state.host.ifBlank { "—" }}:${state.port.ifBlank { "—" }}")
            DiagnosticLine("Companion app", state.connection.name)
            DiagnosticLine("Companion backend", if (state.backendOnline) "Online" else "Offline")
            DiagnosticLine("Desktop frontend", if (state.desktopOnline) "Online" else "Offline")
            if (state.mode == ConnectionMode.LAN) DiagnosticLine("Paired device", state.deviceId.ifBlank { "—" })
        }
    }
}

@Composable
private fun DiagnosticLine(label: String, value: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, modifier = Modifier.weight(1f), color = HalfmoonTextSecondary, fontSize = 12.sp)
        Text(value, modifier = Modifier.weight(2f), color = HalfmoonTextPrimary, fontSize = 12.sp)
    }
}

@Composable
private fun ShellField(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        shape = ControlShape,
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = HalfmoonTextPrimary,
            unfocusedTextColor = HalfmoonTextPrimary,
            focusedContainerColor = HalfmoonDarkSurfaceVariant,
            unfocusedContainerColor = HalfmoonDarkSurfaceVariant,
            focusedBorderColor = ActionBlue,
            unfocusedBorderColor = HalfmoonBorder,
            focusedLabelColor = HalfmoonTextSecondary,
            unfocusedLabelColor = HalfmoonTextSecondary,
        ),
    )
}

@Composable
private fun ShellButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
    enabled: Boolean = true,
    tall: Boolean = false,
) {
    val height = if (tall) 50.dp else 44.dp
    if (primary) {
        Button(
            onClick = onClick,
            modifier = modifier.heightIn(min = height),
            enabled = enabled,
            shape = ControlShape,
            colors = ButtonDefaults.buttonColors(containerColor = ActionBlue, contentColor = Color.White),
        ) { Text(label, fontSize = 14.sp) }
    } else {
        OutlinedButton(
            onClick = onClick,
            modifier = modifier.heightIn(min = height),
            enabled = enabled,
            shape = ControlShape,
            border = BorderStroke(1.dp, HalfmoonBorder),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = HalfmoonTextSecondary),
        ) { Text(label, fontSize = 14.sp) }
    }
}

private fun aggregateStatus(state: CompanionShellState): Pair<Color, String> {
    val appOnline = state.connection == WebConnectionState.CONNECTED && state.backendOnline
    return when {
        appOnline && state.desktopOnline -> SuccessGreen to "已連線"
        appOnline -> WarningYellow to "桌面前端未連線"
        state.desktopOnline -> WarningYellow to "Companion 後端未連線"
        else -> ErrorRed to "未連線"
    }
}
