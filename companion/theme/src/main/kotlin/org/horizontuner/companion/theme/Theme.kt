package org.horizontuner.companion.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Maps existing design-system CSS tokens; pages never select cores or invent colors. */
data class CompanionTokens(
    val background: Color, val backgroundEnd: Color,
    val surface: Color, val surface1: Color, val text: Color, val textSecondary: Color, val border: Color,
    val primary: Color, val secondary: Color, val accent: Color,
    val panelRadius: Int, val controlRadius: Int, val system: DesignSystem,
    val headingWeight: FontWeight, val controlWeight: FontWeight, val tracking: Float,
    val headingSize: Float,
    val controlBorder: Color, val focusColor: Color,
    val headingBackground: Color, val headingColor: Color, val headingInset: Int,
) {
    val panelShape get() = RoundedCornerShape(panelRadius.dp)
    val controlShape get() = RoundedCornerShape(controlRadius.dp)
    val backgroundBrush get() = Brush.linearGradient(listOf(background, backgroundEnd))
    val solidTabs get() = system == DesignSystem.HALFMOON
    val tabMaxWidth = 224.dp // workspace-tabs max-width: 14rem
    val touchTarget = 48.dp
    val badgeShape get() = if (solidTabs) RoundedCornerShape(50) else controlShape
}

fun companionTokens(theme: VisualTheme): CompanionTokens {
    val dark = theme.mode == ThemeMode.DARK
    val system = theme.core.system
    // bg, glass-bg, surface-1, text-primary, text-secondary, glass-border from CSS.
    val palette = when (theme.core) {
        CoreTheme.SWISS -> if (dark) listOf("#0b0d12", "#0e1117", "#161b24", "#f8fafc", "#aeb9c9", "#ffffff") else listOf("#f8fafc", "#ffffff", "#f1f5f9", "#090d16", "#475569", "#000000")
        CoreTheme.EDITORIAL -> if (dark) listOf("#191815", "#22201c", "#2d2a24", "#f3f0e7", "#bdb6a8", "#595347") else listOf("#efede7", "#faf8f2", "#e9e5dc", "#25241f", "#666157", "#c8c3b7")
        CoreTheme.CONTRAST -> if (dark) listOf("#0d0d0d", "#171717", "#262626", "#f5f5f5", "#bfbfbf", "#8a8a8a") else listOf("#eeeeee", "#ffffff", "#e5e5e5", "#101010", "#4b4b4b", "#707070")
        CoreTheme.RHINE -> if (dark) listOf("#11181b", "#202a2f", "#2a363b", "#e0e3dc", "#a6b0b1", "#536166") else listOf("#eae5e1", "#edebe4", "#e7e3d9", "#080a08", "#66645c", "#aaa59a")
        CoreTheme.DEFAULT -> if (dark) listOf("#111a2e", "#101624", "#000000", "#d7d8db", "#94989e", "#ffffff") else listOf("#f0f4fa", "#ffffff", "#f1f5f9", "#0f172a", "#475569", "#000000")
        CoreTheme.MODERN -> if (dark) listOf("#0e172a", "#0f172a", "#000000", "#d1d7e0", "#8d97a6", "#ffffff") else listOf("#f0f3ff", "#ffffff", "#eef2ff", "#0f172a", "#475569", "#000000")
        CoreTheme.ELEGANT -> if (dark) listOf("#1c1813", "#1c1712", "#000000", "#e7e5e4", "#aaa5a1", "#ffffff") else listOf("#f7f4ee", "#fffdf8", "#f7f2e9", "#292219", "#475569", "#000000")
    }.map(::hexColor)
    val halfmoon = system == DesignSystem.HALFMOON
    val end = if (!halfmoon) palette[0] else hexColor(when (theme.core) {
        CoreTheme.MODERN -> if (dark) "#050a16" else "#dbe1f7"
        CoreTheme.ELEGANT -> if (dark) "#0d0a07" else "#e8decb"
        else -> if (dark) "#080b12" else "#dbe4f0"
    })
    val surfaceAlpha = if (!halfmoon) 1f else when (theme.core) {
        CoreTheme.MODERN -> if (dark) .75f else .88f
        CoreTheme.ELEGANT -> if (dark) .78f else .90f
        else -> if (dark) .72f else .85f
    }
    // Halfmoon derives these from core-specific HSL values, rather than the brand palette.
    val hue = when (theme.core) { CoreTheme.MODERN -> 214.3f; CoreTheme.ELEGANT -> 25f; else -> 218f }
    val saturation = if (theme.core == CoreTheme.MODERN) .123f else .05f
    val text = if (halfmoon && dark) Color.hsl(hue, saturation, if (theme.core == CoreTheme.ELEGANT) .90f else .85f) else palette[3]
    val muted = if (halfmoon && dark) Color.hsl(hue, saturation, if (theme.core == CoreTheme.ELEGANT) .65f else .60f) else palette[4]
    val radius = when (theme.core) { CoreTheme.CONTRAST -> 0; CoreTheme.EDITORIAL, CoreTheme.RHINE -> 2; CoreTheme.SWISS -> 4; else -> 16 }
    return CompanionTokens(
        palette[0], end, palette[1].copy(alpha = surfaceAlpha), palette[2].copy(alpha = if (halfmoon) if (dark) .28f else .85f else 1f), text,
        muted,
        palette[5].copy(alpha = if (halfmoon) .10f else if (theme.core == CoreTheme.SWISS) if (dark) .12f else .15f else 1f),
        hexColor(theme.primaryColor), hexColor(theme.secondaryColor), hexColor(theme.accentColor),
        radius, if (halfmoon) 8 else if (theme.core in listOf(CoreTheme.CONTRAST, CoreTheme.RHINE)) 0 else 2, system,
        if (theme.core in listOf(CoreTheme.SWISS, CoreTheme.CONTRAST)) FontWeight.Bold else FontWeight.SemiBold,
        if (halfmoon) FontWeight.Normal else FontWeight.SemiBold,
        when (theme.core) { CoreTheme.EDITORIAL -> 0f; CoreTheme.CONTRAST -> .02f; CoreTheme.RHINE -> .015f; else -> .025f },
        if (theme.core == CoreTheme.EDITORIAL) 16.8f else 16f,
        if (system == DesignSystem.RHINE) hexColor(if (dark) "#829092" else "#77756d") else palette[5].copy(alpha = if (halfmoon) .10f else if (theme.core == CoreTheme.SWISS) if (dark) .12f else .15f else 1f),
        if (halfmoon) hexColor(theme.primaryColor) else palette[3],
        if (theme.core == CoreTheme.CONTRAST) palette[3] else Color.Transparent,
        if (theme.core == CoreTheme.CONTRAST) palette[1] else if (halfmoon) hexColor(theme.primaryColor) else palette[3],
        if (theme.core == CoreTheme.CONTRAST) 8 else 0,
    )
}

val LocalCompanionTokens = staticCompositionLocalOf { companionTokens(VisualTheme()) }

@Composable
fun HalfmoonTheme(theme: VisualTheme = VisualTheme(), content: @Composable () -> Unit) {
    val tokens = companionTokens(theme)
    val base = if (theme.mode == ThemeMode.DARK) darkColorScheme() else lightColorScheme()
    val scheme = base.copy(
        primary = tokens.primary, onPrimary = foreground(tokens.primary), secondary = tokens.secondary,
        onSecondary = foreground(tokens.secondary), tertiary = tokens.accent, onTertiary = foreground(tokens.accent),
        background = tokens.background, surface = tokens.surface, surfaceVariant = tokens.surface1,
        onBackground = tokens.text, onSurface = tokens.text, onSurfaceVariant = tokens.textSecondary,
        outline = tokens.border, error = StatusColors.danger,
    )
    // Shared CSS font stacks fall back to Android sans-serif; no unlicensed native font import.
    val body = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 14.sp, fontFeatureSettings = "tnum, lnum")
    val typography = Typography(
        bodyLarge = body, bodyMedium = body, bodySmall = body.copy(fontSize = 12.sp),
        titleMedium = body.copy(fontSize = tokens.headingSize.sp, fontWeight = tokens.headingWeight),
        labelLarge = body.copy(fontWeight = tokens.controlWeight, letterSpacing = (tokens.tracking * 14).sp),
    )
    CompositionLocalProvider(LocalCompanionTokens provides tokens) {
        MaterialTheme(colorScheme = scheme, shapes = Shapes(small = tokens.controlShape, medium = tokens.panelShape, large = tokens.panelShape), typography = typography, content = content)
    }
}
