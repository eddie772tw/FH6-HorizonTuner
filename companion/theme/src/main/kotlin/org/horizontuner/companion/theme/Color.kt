package org.horizontuner.companion.theme

import androidx.compose.ui.graphics.Color
import kotlin.math.pow

/** Functional status colors are independent of the user palette (Halfmoon semantic colors). */
object StatusColors {
    val success = Color(0xFF198754)
    val warning = Color(0xFFFFC107)
    val danger = Color(0xFFDC3545)
}

fun hexColor(hex: String): Color = Color(0xFF000000L or hex.drop(1).toLong(16))
fun foreground(fill: Color): Color {
    fun linear(channel: Float): Double = if (channel <= 0.04045f) channel / 12.92 else ((channel + 0.055) / 1.055).pow(2.4)
    val luminance = linear(fill.red) * 0.2126 + linear(fill.green) * 0.7152 + linear(fill.blue) * 0.0722
    return if (luminance > 0.179) Color.Black else Color.White
}
