package org.horizontuner.companion.theme

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.center
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs
import kotlin.math.sqrt

class BackgroundTest {
    @Test fun coresAndModesSelectTheCssBackgroundShapeAndAnchor() {
        val anchors = mapOf(CoreTheme.DEFAULT to BackgroundStyle.ELLIPSE_TOP_RIGHT,
            CoreTheme.MODERN to BackgroundStyle.ELLIPSE_TOP_LEFT, CoreTheme.ELEGANT to BackgroundStyle.ELLIPSE_BOTTOM_RIGHT)
        for (core in CoreTheme.entries) for (mode in ThemeMode.entries) {
            val expected = if (core.system != DesignSystem.HALFMOON) BackgroundStyle.SOLID
                else if (mode == ThemeMode.LIGHT) BackgroundStyle.LINEAR_135 else anchors.getValue(core)
            assertEquals(expected, companionTokens(VisualTheme(core = core, mode = mode)).backgroundStyle)
        }
    }

    @Test fun ellipsePreservesAspectRatioAndPassesThroughTheFarthestCornerAfterResize() {
        for (size in listOf(Size(360f, 800f), Size(800f, 360f), Size(500f, 500f))) {
            for (style in listOf(BackgroundStyle.ELLIPSE_TOP_RIGHT, BackgroundStyle.ELLIPSE_TOP_LEFT, BackgroundStyle.ELLIPSE_BOTTOM_RIGHT)) {
                val ellipse = style.ellipse(size)
                fun progress(point: Offset): Float {
                    val delta = point - ellipse.center
                    return sqrt(delta.x * delta.x / (ellipse.radiusX * ellipse.radiusX) + delta.y * delta.y / (ellipse.radiusY * ellipse.radiusY))
                }
                assertEquals(size.width / size.height, ellipse.radiusX / ellipse.radiusY, .00001f)
                assertEquals(0f, progress(ellipse.center), .00001f)
                assertEquals(1f, progress(Offset(size.width - ellipse.center.x, size.height - ellipse.center.y)), .00001f)
                assertEquals(.5f, progress(size.center), .00001f)
                assertEquals(1f / sqrt(2f), progress(Offset(size.width - ellipse.center.x, ellipse.center.y)), .00001f)
                assertEquals(if (style == BackgroundStyle.ELLIPSE_TOP_LEFT) 0f else 1f, ellipse.center.x / size.width, 0f)
                assertEquals(if (style == BackgroundStyle.ELLIPSE_BOTTOM_RIGHT) 1f else 0f, ellipse.center.y / size.height, 0f)
                if (size.width != size.height) assertNotEquals(ellipse.radiusX, ellipse.radiusY)
            }
        }
    }

    @Test fun lightLinearDirectionAndCornerStopsStayCorrectInPortraitAndLandscape() {
        for (size in listOf(Size(360f, 800f), Size(800f, 360f), Size(500f, 500f))) {
            val (from, to) = linear135Endpoints(size)
            val delta = to - from
            fun progress(point: Offset) = ((point.x - from.x) * delta.x + (point.y - from.y) * delta.y) / (delta.x * delta.x + delta.y * delta.y)
            assertEquals(delta.x, delta.y, .00001f)
            assertEquals(size.center.x, (from.x + to.x) / 2, .00001f)
            assertEquals(size.center.y, (from.y + to.y) / 2, .00001f)
            assertTrue(abs(progress(Offset.Zero)) < .00001f)
            assertEquals(1f, progress(Offset(size.width, size.height)), .00001f)
        }
    }
}
