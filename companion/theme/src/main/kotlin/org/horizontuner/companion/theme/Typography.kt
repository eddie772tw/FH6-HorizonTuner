package org.horizontuner.companion.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import java.util.Locale

/** Requested CSS families. Native glyph fidelity remains blocked on audited Android font assets. */
enum class CompanionFontStack(val requestedFamilies: List<String>) {
    HALFMOON(listOf("Outfit", "Inter")),
    SWISS(listOf("Inter")),
    RHINE(listOf("Rhine MiSans"));

    // CSS-only Google Fonts and MiSans WOFF2 shards are not bundled Android fonts.
    val bodyFamily: FontFamily get() = FontFamily.SansSerif
    val instrumentFamily: FontFamily get() = if (this == HALFMOON) FontFamily.Monospace else bodyFamily
}

const val COMPANION_NUMERIC_FEATURES = "\"tnum\" 1, \"lnum\" 1"

data class CompanionTypography(
    val fontStack: CompanionFontStack,
    val material: Typography,
    val supporting: TextStyle,
    val badge: TextStyle,
    val selectedTab: TextStyle,
    val readoutLabel: TextStyle,
    val readoutValue: TextStyle,
    val uppercaseReadoutLabel: Boolean,
) {
    fun readoutLabelText(text: String): String = if (uppercaseReadoutLabel) text.uppercase(Locale.ROOT) else text
}

/** CSS heading, control, badge and readout roles are independent; tracking uses em at every size. */
fun companionTypography(core: CoreTheme): CompanionTypography {
    val stack = when (core.system) {
        DesignSystem.HALFMOON -> CompanionFontStack.HALFMOON
        DesignSystem.SWISS -> CompanionFontStack.SWISS
        DesignSystem.RHINE -> CompanionFontStack.RHINE
    }
    val headingTracking = when (core) {
        CoreTheme.SWISS -> .04f
        CoreTheme.EDITORIAL -> 0f
        CoreTheme.CONTRAST -> .02f
        CoreTheme.RHINE -> .015f
        else -> .025f
    }
    val controlTracking = when (core) {
        CoreTheme.SWISS -> .025f
        CoreTheme.CONTRAST -> .02f
        CoreTheme.RHINE -> .015f
        else -> 0f
    }
    // Swiss badges use control-tracking; Rhine .badge independently specifies .025em.
    val badgeTracking = if (core == CoreTheme.RHINE) .025f else controlTracking
    // Halfmoon .badge uses --bs-font-weight-normal=400; Swiss/Rhine explicitly override to 600.
    val badgeWeight = if (core.system == DesignSystem.HALFMOON) FontWeight.Normal else FontWeight.SemiBold
    val headingWeight = if (core == CoreTheme.SWISS || core == CoreTheme.CONTRAST) FontWeight.Bold else FontWeight.SemiBold
    val controlWeight = if (core.system == DesignSystem.HALFMOON) FontWeight.Normal else FontWeight.SemiBold
    val body = TextStyle(
        fontFamily = stack.bodyFamily, fontSize = 14.sp, fontWeight = FontWeight.Normal,
        letterSpacing = 0.em, fontFeatureSettings = COMPANION_NUMERIC_FEATURES,
    )
    fun heading(style: TextStyle) = body.copy(
        fontSize = style.fontSize, lineHeight = style.lineHeight,
        fontWeight = headingWeight, letterSpacing = headingTracking.em,
    )
    fun control(size: Int) = body.copy(fontSize = size.sp, fontWeight = controlWeight, letterSpacing = controlTracking.em)
    val defaults = Typography()
    val material = Typography(
        displayLarge = heading(defaults.displayLarge), displayMedium = heading(defaults.displayMedium), displaySmall = heading(defaults.displaySmall),
        headlineLarge = heading(defaults.headlineLarge), headlineMedium = heading(defaults.headlineMedium), headlineSmall = heading(defaults.headlineSmall),
        titleLarge = heading(defaults.titleLarge),
        titleMedium = heading(body.copy(fontSize = if (core == CoreTheme.EDITORIAL) 16.8.sp else 16.sp)),
        titleSmall = heading(defaults.titleSmall),
        bodyLarge = body, bodyMedium = body, bodySmall = body.copy(fontSize = 12.sp),
        labelLarge = control(14), labelMedium = control(12), labelSmall = control(11),
    )
    return CompanionTypography(
        fontStack = stack,
        material = material,
        supporting = body.copy(fontSize = 13.sp),
        badge = body.copy(fontSize = 12.sp, fontWeight = badgeWeight, letterSpacing = badgeTracking.em),
        selectedTab = control(14).copy(fontWeight = if (core.system == DesignSystem.SWISS) FontWeight.Bold else FontWeight.SemiBold),
        readoutLabel = body.copy(fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
            letterSpacing = (if (core == CoreTheme.SWISS || core == CoreTheme.CONTRAST) .08f else .025f).em),
        readoutValue = body.copy(fontFamily = stack.instrumentFamily),
        uppercaseReadoutLabel = core.system == DesignSystem.SWISS,
    )
}

val LocalCompanionTypography = staticCompositionLocalOf { companionTypography(CoreTheme.DEFAULT) }
