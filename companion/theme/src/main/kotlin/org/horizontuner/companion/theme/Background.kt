package org.horizontuner.companion.theme

import android.graphics.Matrix
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.center
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.LinearGradientShader
import androidx.compose.ui.graphics.RadialGradientShader
import androidx.compose.ui.graphics.Shader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.SolidColor
import kotlin.math.sqrt

enum class BackgroundStyle { SOLID, LINEAR_135, ELLIPSE_TOP_RIGHT, ELLIPSE_TOP_LEFT, ELLIPSE_BOTTOM_RIGHT }

fun backgroundStyle(theme: VisualTheme): BackgroundStyle = when {
    theme.core.system != DesignSystem.HALFMOON -> BackgroundStyle.SOLID
    theme.mode == ThemeMode.LIGHT -> BackgroundStyle.LINEAR_135
    theme.core == CoreTheme.MODERN -> BackgroundStyle.ELLIPSE_TOP_LEFT
    theme.core == CoreTheme.ELEGANT -> BackgroundStyle.ELLIPSE_BOTTOM_RIGHT
    else -> BackgroundStyle.ELLIPSE_TOP_RIGHT
}

internal data class BackgroundEllipse(val center: Offset, val radiusX: Float, val radiusY: Float)

/** CSS ellipse/farthest-corner: preserve farthest-side aspect ratio, pass through the opposite corner. */
internal fun BackgroundStyle.ellipse(size: Size): BackgroundEllipse {
    require(size.width > 0f && size.height > 0f && size.width.isFinite() && size.height.isFinite())
    val center = when (this) {
        BackgroundStyle.ELLIPSE_TOP_RIGHT -> Offset(size.width, 0f)
        BackgroundStyle.ELLIPSE_TOP_LEFT -> Offset.Zero
        BackgroundStyle.ELLIPSE_BOTTOM_RIGHT -> Offset(size.width, size.height)
        else -> error("Not an elliptical background")
    }
    val cornerScale = sqrt(2f)
    return BackgroundEllipse(center, size.width * cornerScale, size.height * cornerScale)
}

/** CSS 135deg has a fixed direction even on a rectangular viewport. */
internal fun linear135Endpoints(size: Size): Pair<Offset, Offset> {
    val halfExtent = (size.width + size.height) / 4f
    val delta = Offset(halfExtent, halfExtent)
    return size.center - delta to size.center + delta
}

internal fun backgroundBrush(style: BackgroundStyle, start: Color, end: Color): Brush {
    if (style == BackgroundStyle.SOLID) return SolidColor(start)
    return object : ShaderBrush() {
        override fun createShader(size: Size): Shader {
            if (style == BackgroundStyle.LINEAR_135) {
                val (from, to) = linear135Endpoints(size)
                return LinearGradientShader(from, to, listOf(start, end))
            }
            val ellipse = style.ellipse(size)
            // A unit radial shader is stretched independently on both axes, then translated.
            // ShaderBrush caches this shader until its drawing size changes.
            return RadialGradientShader(Offset.Zero, 1f, listOf(start, end)).apply {
                setLocalMatrix(Matrix().apply {
                    setScale(ellipse.radiusX, ellipse.radiusY)
                    postTranslate(ellipse.center.x, ellipse.center.y)
                })
            }
        }
    }
}
