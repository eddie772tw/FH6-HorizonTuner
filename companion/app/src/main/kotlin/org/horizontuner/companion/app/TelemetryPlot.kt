package org.horizontuner.companion.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import org.horizontuner.companion.theme.LocalCompanionTokens
import org.horizontuner.companion.theme.StatusColors

/** Bounded recent samples; drawing has no interpolation or per-frame animations. */
@Composable
internal fun TelemetryPlot(series: List<List<Float>>, labels: List<String>, minimum: Float, maximum: Float) {
    val tokens = LocalCompanionTokens.current
    val colors = listOf(tokens.primary, StatusColors.danger, tokens.secondary, tokens.accent)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        labels.forEachIndexed { index, label -> Text(label, color = colors[index % colors.size], style = MaterialTheme.typography.labelMedium) }
    }
    Canvas(Modifier.fillMaxWidth().height(100.dp)) {
        val span = (maximum - minimum).coerceAtLeast(1f)
        val zero = size.height * (maximum / span).coerceIn(0f, 1f)
        drawLine(tokens.border, Offset(0f, zero), Offset(size.width, zero))
        series.forEachIndexed { index, values ->
            if (values.size > 1) {
                val path = Path()
                values.forEachIndexed { sample, value ->
                    val x = size.width * sample / (values.size - 1)
                    val y = size.height * (1f - (value.coerceIn(minimum, maximum) - minimum) / span)
                    if (sample == 0) path.moveTo(x, y) else path.lineTo(x, y)
                }
                drawPath(path, colors[index % colors.size], style = Stroke(2.dp.toPx()))
            }
        }
    }
    Text("最近 6 秒", color = tokens.textSecondary, style = MaterialTheme.typography.labelSmall)
}
