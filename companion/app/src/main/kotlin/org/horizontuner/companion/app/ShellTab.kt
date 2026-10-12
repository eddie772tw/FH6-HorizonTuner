package org.horizontuner.companion.app

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import org.horizontuner.companion.theme.DesignSystem
import org.horizontuner.companion.theme.LocalCompanionTokens
import org.horizontuner.companion.theme.LocalCompanionTypography
import org.horizontuner.companion.theme.RhineNavigation
import org.horizontuner.companion.theme.foreground

@Composable
internal fun ShellTab(page: OfflinePage, selected: Boolean, indicatorColor: Color, onSelect: (OfflinePage) -> Unit) {
    val tokens = LocalCompanionTokens.current
    val rhine = tokens.system == DesignSystem.RHINE
    val interactions = remember { MutableInteractionSource() }
    val hovered by interactions.collectIsHoveredAsState()
    val focused by interactions.collectIsFocusedAsState()
    val target = RhineNavigation.target(selected, hovered, focused)
    // Compose's animation coroutine inherits Android's live MotionDurationScale.
    // Scale 0 (Remove animations) goes to the target; do not multiply durations again.
    val decoration = if (rhine) {
        val marker = animateFloatAsState(target.markerScale, RhineNavigation.markerAnimation, label = "Rhine marker")
        val underline = animateFloatAsState(target.underlineScale, RhineNavigation.underlineAnimation, label = "Rhine underline")
        Modifier.drawWithContent {
            drawContent()
            val markerHeight = size.height * RhineNavigation.markerHeightFraction
            val scaledHeight = markerHeight * marker.value
            val markerBottom = size.height * (RhineNavigation.markerTopFraction + RhineNavigation.markerHeightFraction)
            drawRect(
                color = if (target.emphasized) tokens.text else tokens.textSecondary,
                topLeft = Offset(RhineNavigation.markerInset.dp.toPx(), markerBottom - scaledHeight),
                size = Size(RhineNavigation.markerWidth.dp.toPx(), scaledHeight),
            )
            val inset = RhineNavigation.underlineInset.dp.toPx()
            drawRect(
                color = tokens.primary,
                topLeft = Offset(inset, size.height - 1.dp.toPx()),
                size = Size((size.width - 2 * inset).coerceAtLeast(0f) * underline.value, RhineNavigation.underlineHeight.dp.toPx()),
            )
            if (focused) {
                val stroke = 2.dp.toPx()
                drawRect(tokens.focusColor, Offset(stroke / 2, stroke / 2), Size(size.width - stroke, size.height - stroke), style = Stroke(stroke))
            }
        }
    } else Modifier
    Column(
        modifier = Modifier.widthIn(max = tokens.tabMaxWidth).width(IntrinsicSize.Max).heightIn(min = tokens.touchTarget)
            .then(decoration)
            .background(if (selected && tokens.solidTabs) tokens.primary else if (selected && tokens.system == DesignSystem.SWISS) tokens.surface1 else Color.Transparent, tokens.controlShape)
            .selectable(selected = selected, role = Role.Tab, interactionSource = interactions,
                indication = if (rhine) null else LocalIndication.current, onClick = { onSelect(page) }),
    ) {
        Row(modifier = Modifier.padding(start = if (rhine) RhineNavigation.labelStart.dp else 12.dp, end = 12.dp, top = 12.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(page.label, style = if (selected) LocalCompanionTypography.current.selectedTab else MaterialTheme.typography.labelLarge,
                color = if (selected && tokens.solidTabs) foreground(tokens.primary) else if (selected || (rhine && target.emphasized)) tokens.text else tokens.textSecondary)
            if (page == OfflinePage.CONNECTION) {
                Spacer(Modifier.size(5.dp))
                Box(Modifier.size(7.dp).background(indicatorColor, RoundedCornerShape(50)))
            }
        }
        if (!tokens.solidTabs && !rhine) {
            Box(Modifier.fillMaxWidth().height(3.dp).background(if (selected) tokens.primary else Color.Transparent))
        }
    }
}

