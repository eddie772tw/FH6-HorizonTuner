package org.horizontuner.companion.theme

import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import org.junit.Assert.*
import org.junit.Test

class CompanionTypographyTest {
    // CSS design-systems/{halfmoon,swiss,rhine}.css: heading/control/badge/readout are separate roles.
    @Test fun allSevenCoresMatchCssRoleWeightsTrackingAndSectionSizes() {
        data class Expected(val core: CoreTheme, val headingWeight: Int, val heading: Float, val controlWeight: Int, val control: Float, val badgeWeight: Int, val badge: Float, val readout: Float)
        val cases = listOf(
            Expected(CoreTheme.DEFAULT, 600, .025f, 400, 0f, 400, 0f, .025f),
            Expected(CoreTheme.MODERN, 600, .025f, 400, 0f, 400, 0f, .025f),
            Expected(CoreTheme.ELEGANT, 600, .025f, 400, 0f, 400, 0f, .025f),
            Expected(CoreTheme.SWISS, 700, .04f, 600, .025f, 600, .025f, .08f),
            Expected(CoreTheme.EDITORIAL, 600, 0f, 600, 0f, 600, 0f, .025f),
            Expected(CoreTheme.CONTRAST, 700, .02f, 600, .02f, 600, .02f, .08f),
            Expected(CoreTheme.RHINE, 600, .015f, 600, .015f, 600, .025f, .025f),
        )
        assertEquals(CoreTheme.entries.toSet(), cases.map { it.core }.toSet())
        for (case in cases) {
            val roles = companionTypography(case.core)
            with(roles.material) {
                assertEquals(case.headingWeight, titleMedium.fontWeight!!.weight)
                assertEquals(case.heading.em, titleMedium.letterSpacing)
                assertEquals(if (case.core == CoreTheme.EDITORIAL) 16.8.sp else 16.sp, titleMedium.fontSize)
                for (control in listOf(labelLarge, labelMedium, labelSmall)) {
                    assertEquals(case.controlWeight, control.fontWeight!!.weight)
                    assertEquals(case.control.em, control.letterSpacing)
                }
                assertEquals(case.heading.em, headlineLarge.letterSpacing)
                assertEquals(case.heading.em, titleSmall.letterSpacing)
            }
            assertEquals(case.readout.em, roles.readoutLabel.letterSpacing)
            assertEquals(case.badgeWeight, roles.badge.fontWeight!!.weight) // Halfmoon normal=400; Swiss/Rhine=600.
            assertEquals(case.badge.em, roles.badge.letterSpacing) // Rhine .badge is .025em, not control .015em.
            assertEquals(11.sp, roles.readoutLabel.fontSize) // base.css: .6875rem
            assertEquals(FontWeight.SemiBold, roles.readoutLabel.fontWeight)
            assertEquals(case.control.em, roles.selectedTab.letterSpacing)
            assertEquals(if (case.core.system == DesignSystem.SWISS) FontWeight.Bold else FontWeight.SemiBold, roles.selectedTab.fontWeight)
        }
    }

    @Test fun pureRoleDefaultsRemainExplicitOutsideAndroidThemeProvider() {
        for (core in CoreTheme.entries) {
            val roles = companionTypography(core)
            assertEquals(when (core.system) {
                DesignSystem.HALFMOON -> listOf("Outfit", "Inter")
                DesignSystem.SWISS -> listOf("Inter")
                DesignSystem.RHINE -> listOf("Rhine MiSans")
            }, roles.fontStack.requestedFamilies)
            assertEquals(FontFamily.SansSerif, roles.material.bodyMedium.fontFamily)
            assertEquals(if (core.system == DesignSystem.HALFMOON) FontFamily.Monospace else FontFamily.SansSerif, roles.readoutValue.fontFamily)
            assertEquals(FontFamily.SansSerif, roles.readoutLabel.fontFamily)
        }
    }

    @Test fun everyMaterialRoleAndShellRoleCarriesExplicitFamilyAndNumericFeatures() {
        for (core in CoreTheme.entries) {
            val roles = companionTypography(core)
            val material = roles.material
            val styles = with(material) { listOf(
                displayLarge, displayMedium, displaySmall, headlineLarge, headlineMedium, headlineSmall,
                titleLarge, titleMedium, titleSmall, bodyLarge, bodyMedium, bodySmall, labelLarge, labelMedium, labelSmall,
            ) } + listOf(roles.supporting, roles.badge, roles.selectedTab, roles.readoutLabel, roles.readoutValue)
            for (style in styles) {
                assertNotNull(style.fontFamily)
                assertEquals("\"tnum\" 1, \"lnum\" 1", style.fontFeatureSettings) // base.css body inheritance
            }
            assertEquals(0.em, material.bodySmall.letterSpacing)
            assertEquals(FontWeight.Normal, material.bodySmall.fontWeight) // diagnostics dt/dd are not instrument labels
            assertEquals(0.em, roles.readoutValue.letterSpacing) // label tracking must not spread the digits
            assertEquals(13.sp, roles.supporting.fontSize)
            assertEquals(12.sp, roles.badge.fontSize)
        }
    }

    @Test fun readoutCasingFollowsCssWithoutChangingValuesOrChineseLabels() {
        for (core in CoreTheme.entries) {
            val roles = companionTypography(core)
            assertEquals(if (core.system == DesignSystem.SWISS) "INPUT ID" else "input id", roles.readoutLabelText("input id"))
            assertEquals("胎溫", roles.readoutLabelText("胎溫"))
            assertEquals("123.45", roles.readoutLabelText("123.45"))
        }
    }
}
