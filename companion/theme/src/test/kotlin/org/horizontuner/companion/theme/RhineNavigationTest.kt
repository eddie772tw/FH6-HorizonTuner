package org.horizontuner.companion.theme

import androidx.compose.animation.core.Animatable
import androidx.compose.runtime.MonotonicFrameClock
import androidx.compose.ui.MotionDurationScale
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.yield
import org.junit.Assert.*
import org.junit.Test

class RhineNavigationTest {
    @Test fun markerEmphasizesSelectionHoverAndKeyboardFocusButUnderlineOnlySelection() {
        for (selected in listOf(false, true)) for (hovered in listOf(false, true)) for (focused in listOf(false, true)) {
            val target = RhineNavigation.target(selected, hovered, focused)
            assertEquals(selected || hovered || focused, target.emphasized)
            assertEquals(if (target.emphasized) 1f else RhineNavigation.restingMarkerScale, target.markerScale, 0f)
            assertEquals(if (selected) 1f else 0f, target.underlineScale, 0f)
        }
        assertEquals(RhineNavigation.target(false, false, false), RhineNavigation.target(false, true, true, enabled = false))
        assertEquals(1f, RhineNavigation.target(true, true, true, enabled = false).underlineScale, 0f)
    }

    @Test fun realComposeAnimationsRespectDurationScaleIncludingRemoveAnimations() = runBlocking {
        suspend fun elapsed(scale: Float): Long {
            val clock = TestFrameClock()
            val durationScale = object : MotionDurationScale { override val scaleFactor = scale }
            withContext(clock + durationScale) {
                val marker = Animatable(RhineNavigation.restingMarkerScale)
                marker.animateTo(1f, RhineNavigation.markerAnimation)
                assertEquals(1f, marker.value, 0f)
                val underline = Animatable(0f)
                underline.animateTo(1f, RhineNavigation.underlineAnimation)
                assertEquals(1f, underline.value, 0f)
            }
            return clock.timeNanos
        }
        val normal = elapsed(1f)
        assertTrue(elapsed(.5f) < normal)
        assertTrue(elapsed(2f) > normal)
        assertTrue(elapsed(0f) <= 4 * TestFrameClock.frameNanos)
    }

    @Test fun removingMotionDuringAnAnimationSettlesAtTheTarget() = runBlocking {
        val clock = TestFrameClock()
        val durationScale = object : MotionDurationScale {
            override val scaleFactor get() = if (clock.timeNanos >= 3 * TestFrameClock.frameNanos) 0f else 1f
        }
        withContext(clock + durationScale) {
            val marker = Animatable(1f)
            marker.animateTo(RhineNavigation.restingMarkerScale, RhineNavigation.markerAnimation)
            assertEquals(RhineNavigation.restingMarkerScale, marker.value, 0f)
            assertTrue(clock.timeNanos < RhineNavigation.markerDurationMillis * 1_000_000L)
        }
    }

    private class TestFrameClock : MonotonicFrameClock {
        var timeNanos = 0L
        override suspend fun <R> withFrameNanos(onFrame: (Long) -> R): R {
            yield()
            timeNanos += frameNanos
            return onFrame(timeNanos)
        }
        companion object { const val frameNanos = 16_000_000L }
    }
}
