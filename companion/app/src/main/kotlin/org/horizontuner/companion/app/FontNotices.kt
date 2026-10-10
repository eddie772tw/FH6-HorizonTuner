package org.horizontuner.companion.app

import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

/** Full shipped copyright/license text remains readable offline, including before pairing. */
@Composable
internal fun FontNoticesButton() {
    var open by remember { mutableStateOf(false) }
    TextButton(onClick = { open = true }, modifier = Modifier.heightIn(min = 48.dp)) { Text("字型授權") }
    if (open) {
        val assets = LocalContext.current.assets
        val notices = remember(assets) {
            listOf("Outfit-OFL.txt", "Inter-OFL.txt", "Inter-METADATA.pb").joinToString("\n\n") { name ->
                "$name\n\n" + assets.open("font_notices/$name").bufferedReader(Charsets.UTF_8).use { it.readText() }
            }
        }
        AlertDialog(
            onDismissRequest = { open = false },
            title = { Text("字型授權") },
            text = { SelectionContainer { Text(notices, Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState())) } },
            confirmButton = { TextButton(onClick = { open = false }, modifier = Modifier.heightIn(min = 48.dp)) { Text("關閉") } },
        )
    }
}
