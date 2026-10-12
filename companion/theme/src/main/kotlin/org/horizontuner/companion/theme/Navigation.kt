package org.horizontuner.companion.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween

/** rhine.css workspace-tabs pseudo-elements; dimensions are dp equivalents of CSS px. */
object RhineNavigation {
    const val markerInset = 8
    const val markerWidth = 2
    const val markerTopFraction = .25f
    const val markerHeightFraction = .50f
    const val restingMarkerScale = .35f
    const val labelStart = 20
    const val underlineInset = 8
    const val underlineHeight = 2
    const val markerDurationMillis = 150
    const val underlineDurationMillis = 180
    val markerAnimation = tween<Float>(markerDurationMillis, easing = CubicBezierEasing(.25f, .1f, .25f, 1f))
    val underlineAnimation = tween<Float>(underlineDurationMillis, easing = CubicBezierEasing(.22f, 1f, .36f, 1f))

    fun target(selected: Boolean, hovered: Boolean, focused: Boolean, enabled: Boolean = true): RhineTabTarget {
        val emphasized = selected || (enabled && (hovered || focused))
        return RhineTabTarget(if (emphasized) 1f else restingMarkerScale, if (selected) 1f else 0f, emphasized)
    }
}

data class RhineTabTarget(val markerScale: Float, val underlineScale: Float, val emphasized: Boolean)
