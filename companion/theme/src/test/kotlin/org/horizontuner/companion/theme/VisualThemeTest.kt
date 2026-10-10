package org.horizontuner.companion.theme

import androidx.compose.ui.graphics.Color
import org.junit.Assert.*
import org.junit.Test

class VisualThemeTest {
    @Test fun tokensMapAllCoresModesAndKeepStatusColorsIndependent() {
        for (core in CoreTheme.entries) for (mode in ThemeMode.entries) {
            val tokens = companionTokens(VisualTheme(mode, core, "#123456", "#abcdef", "#987654"))
            assertEquals(hexColor("#123456"), tokens.primary)
            assertEquals(hexColor("#abcdef"), tokens.secondary)
            assertEquals(hexColor("#987654"), tokens.accent)
            assertEquals(core.system, tokens.system)
            assertNotEquals(StatusColors.danger, tokens.primary)
            assertEquals(core.system == DesignSystem.HALFMOON, tokens.solidTabs)
            assertNotEquals(tokens.text, tokens.surface)
            if (core.system != DesignSystem.HALFMOON) assertEquals(tokens.text, tokens.focusColor)
        }
    }
    @Test fun shapeSurfaceHeadingAndForegroundRolesKeepTheSystemsDistinct() {
        val halfmoon = companionTokens(VisualTheme(core = CoreTheme.DEFAULT))
        val swiss = companionTokens(VisualTheme(core = CoreTheme.SWISS))
        val rhine = companionTokens(VisualTheme(core = CoreTheme.RHINE))
        val contrast = companionTokens(VisualTheme(core = CoreTheme.CONTRAST))
        assertTrue(halfmoon.panelRadius > swiss.panelRadius)
        assertNotEquals(swiss.background, rhine.background)
        assertNotEquals(rhine.border, rhine.controlBorder)
        assertEquals(0, contrast.controlRadius)
        assertEquals(contrast.text, contrast.headingBackground)
        assertEquals(contrast.surface, contrast.headingColor)
        assertEquals(Color.Black, foreground(hexColor("#f1f5f9")))
        assertEquals(Color.White, foreground(hexColor("#123456")))
    }
}
