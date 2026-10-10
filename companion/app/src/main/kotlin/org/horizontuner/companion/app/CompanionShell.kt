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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import org.horizontuner.companion.theme.LocalCompanionTokens
import org.horizontuner.companion.theme.StatusColors
import org.horizontuner.companion.theme.foreground
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp


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
    val isDevMode: Boolean = BuildConfig.DEBUG,
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
        modifier = Modifier.fillMaxSize().background(LocalCompanionTokens.current.backgroundBrush).windowInsetsPadding(WindowInsets.safeDrawing),
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
    val tokens = LocalCompanionTokens.current
    val (indicatorColor, _) = aggregateStatus(state)
    Row(
        modifier = Modifier.fillMaxWidth().background(tokens.surface)
            .horizontalScroll(rememberScrollState()).selectableGroup().padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(if (tokens.solidTabs) 8.dp else 0.dp),
    ) {
        OfflinePage.entries.forEach { page ->
            val selected = page == state.page
            Column(
                modifier = Modifier.widthIn(max = tokens.tabMaxWidth).width(IntrinsicSize.Max).heightIn(min = tokens.touchTarget)
                    .background(if (selected && tokens.solidTabs) tokens.primary else if (selected && tokens.system == org.horizontuner.companion.theme.DesignSystem.SWISS) tokens.surface1 else Color.Transparent, tokens.controlShape)
                    .selectable(selected = selected, role = Role.Tab, onClick = { onSelect(page) }),
            ) {
                // Rhine's tick remains distinct from Swiss's plain underline.
                if (tokens.system == org.horizontuner.companion.theme.DesignSystem.RHINE) {
                    Box(Modifier.padding(start = 12.dp).size(1.dp, 4.dp).background(tokens.border))
                }
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(page.label, style = MaterialTheme.typography.labelLarge,
                        color = if (selected && tokens.solidTabs) foreground(tokens.primary) else if (selected) tokens.text else tokens.textSecondary)
                    if (page == OfflinePage.CONNECTION) {
                        Spacer(Modifier.size(5.dp))
                        Box(Modifier.size(7.dp).background(indicatorColor, RoundedCornerShape(50)))
                    }
                }
                if (!tokens.solidTabs) Box(Modifier.fillMaxWidth().height(if (tokens.system == org.horizontuner.companion.theme.DesignSystem.RHINE) 2.dp else 3.dp).background(if (selected) tokens.primary else Color.Transparent))
            }
        }
    }
}

@Composable
private fun OfflinePageContent(page: OfflinePage, onSelect: (OfflinePage) -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().background(LocalCompanionTokens.current.backgroundBrush).padding(12.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().background(LocalCompanionTokens.current.surface, LocalCompanionTokens.current.panelShape)
                .border(1.dp, LocalCompanionTokens.current.border, LocalCompanionTokens.current.panelShape).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ShellHeading(page.label)
            Text("PC Companion 尚未連線，${page.label} 暫時無法取得資料。", color = LocalCompanionTokens.current.textSecondary, fontSize = 14.sp)
            ShellButton("前往 Connection", onClick = { onSelect(OfflinePage.CONNECTION) }, primary = true, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
private fun ConnectionPage(state: CompanionShellState, actions: CompanionShellActions) {
    Column(
        modifier = Modifier.fillMaxSize().background(LocalCompanionTokens.current.backgroundBrush).verticalScroll(rememberScrollState()).padding(12.dp),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().background(LocalCompanionTokens.current.surface, LocalCompanionTokens.current.panelShape)
                .border(1.dp, LocalCompanionTokens.current.border, LocalCompanionTokens.current.panelShape).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ShellHeading("Connection")
            if (state.isDevMode) {
                Text("選擇一般使用的區域網路，或選擇 USB 除錯連線。", color = LocalCompanionTokens.current.textSecondary, fontSize = 14.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ShellButton("Local network", onClick = { actions.selectMode(ConnectionMode.LAN) }, primary = state.mode == ConnectionMode.LAN)
                    ShellButton("USB debugging", onClick = { actions.selectMode(ConnectionMode.USB) }, primary = state.mode == ConnectionMode.USB)
                }
            } else {
                Text("透過區域網路 (Wi-Fi) 連接桌面 HorizonTuner。", color = LocalCompanionTokens.current.textSecondary, fontSize = 14.sp)
            }
            val (statusColor, statusText) = aggregateStatus(state)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(statusText, modifier = Modifier.background(statusColor, LocalCompanionTokens.current.badgeShape).padding(horizontal = 9.dp, vertical = 3.dp), color = foreground(statusColor), fontSize = 12.sp)
                Text("${state.host.ifBlank { "—" }}:${state.port.ifBlank { "—" }}", color = LocalCompanionTokens.current.textSecondary, fontSize = 13.sp)
            }
            if (state.mode == ConnectionMode.LAN) {
                Column(
                    modifier = Modifier.fillMaxWidth().background(LocalCompanionTokens.current.surface1, LocalCompanionTokens.current.controlShape)
                        .border(1.dp, LocalCompanionTokens.current.border, LocalCompanionTokens.current.controlShape).padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ShellButton("掃描 QR 並配對", onClick = actions.scanQr, primary = true, enabled = state.connection != WebConnectionState.LOADING, modifier = Modifier.fillMaxWidth(), tall = true)
                    Text("掃描桌面端產生的 QR 碼，會自動選擇可連線的 LAN 位址。", color = LocalCompanionTokens.current.textSecondary, fontSize = 13.sp)
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
                    if (!state.isDevMode) {
                        Spacer(Modifier.size(4.dp))
                        ShellButton("切換至 USB 模式（開發者選項）", onClick = { actions.selectMode(ConnectionMode.USB) })
                    }
                }
            } else {
                ShellField("USB forwarded host", state.host, actions.setHost)
                ShellField("Port", state.port, actions.setPort)
                ShellButton(if (state.connection == WebConnectionState.ERROR) "重試 USB" else "連接 USB", onClick = actions.connectUsb, primary = true, enabled = state.connection != WebConnectionState.LOADING)
                if (state.webConnected) ShellButton("中斷連線", onClick = actions.disconnect)
                if (!state.isDevMode) {
                    Spacer(Modifier.size(4.dp))
                    ShellButton("返回區域網路 (LAN) 模式", onClick = { actions.selectMode(ConnectionMode.LAN) }, primary = true)
                }
            }
            state.error?.let { Text(it, color = StatusColors.danger, fontSize = 13.sp) }
            if (!state.webConnected) ShellButton("返回主畫面", onClick = { actions.selectPage(OfflinePage.TELEMETRY) })
            Spacer(Modifier.heightIn(min = 24.dp))
            ConnectionDiagnostics(state)
        }
    }
}

@Composable
private fun ConnectionDiagnostics(state: CompanionShellState) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ShellHeading("Connection diagnostics")
        Column(
            modifier = Modifier.fillMaxWidth().background(LocalCompanionTokens.current.surface1, LocalCompanionTokens.current.controlShape)
                .border(1.dp, LocalCompanionTokens.current.border, LocalCompanionTokens.current.controlShape).padding(10.dp),
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
        Text(label, modifier = Modifier.weight(1f), color = LocalCompanionTokens.current.textSecondary, fontSize = 12.sp)
        Text(value, modifier = Modifier.weight(2f), color = LocalCompanionTokens.current.text, fontSize = 12.sp)
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
        shape = LocalCompanionTokens.current.controlShape,
        colors = OutlinedTextFieldDefaults.colors(
            focusedTextColor = LocalCompanionTokens.current.text,
            unfocusedTextColor = LocalCompanionTokens.current.text,
            focusedContainerColor = LocalCompanionTokens.current.surface1,
            unfocusedContainerColor = LocalCompanionTokens.current.surface1,
            focusedBorderColor = LocalCompanionTokens.current.focusColor,
            unfocusedBorderColor = LocalCompanionTokens.current.controlBorder,
            focusedLabelColor = LocalCompanionTokens.current.textSecondary,
            unfocusedLabelColor = LocalCompanionTokens.current.textSecondary,
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
    val height = if (tall) 50.dp else LocalCompanionTokens.current.touchTarget
    if (primary) {
        Button(
            onClick = onClick,
            modifier = modifier.heightIn(min = height),
            enabled = enabled,
            shape = LocalCompanionTokens.current.controlShape,
            colors = ButtonDefaults.buttonColors(containerColor = LocalCompanionTokens.current.primary, contentColor = foreground(LocalCompanionTokens.current.primary)),
        ) { Text(label, style = MaterialTheme.typography.labelLarge) }
    } else {
        OutlinedButton(
            onClick = onClick,
            modifier = modifier.heightIn(min = height),
            enabled = enabled,
            shape = LocalCompanionTokens.current.controlShape,
            border = BorderStroke(1.dp, LocalCompanionTokens.current.controlBorder),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = LocalCompanionTokens.current.textSecondary),
        ) { Text(label, fontSize = 14.sp) }
    }
}

@Composable
private fun ShellHeading(label: String) {
    val tokens = LocalCompanionTokens.current
    Text(label, color = tokens.headingColor, style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.fillMaxWidth().background(tokens.headingBackground).padding(tokens.headingInset.dp))
}

private fun aggregateStatus(state: CompanionShellState): Pair<Color, String> {
    val appOnline = state.connection == WebConnectionState.CONNECTED && state.backendOnline
    return when {
        appOnline && state.desktopOnline -> StatusColors.success to "已連線"
        appOnline -> StatusColors.warning to "桌面前端未連線"
        state.desktopOnline -> StatusColors.warning to "Companion 後端未連線"
        else -> StatusColors.danger to "未連線"
    }
}
