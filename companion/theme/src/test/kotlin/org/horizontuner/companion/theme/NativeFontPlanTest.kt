package org.horizontuner.companion.theme

import androidx.compose.ui.text.font.FontFamily
import org.junit.Assert.*
import org.junit.Test

class NativeFontPlanTest {
    @Test fun eachWeightHasAnOrderedGlyphFallbackChainAndExactAxes() {
        for (weight in 100..900 step 100) {
            val halfmoon = nativeFontPlan(CompanionFontStack.HALFMOON, weight, 20f)
            assertEquals(listOf(BundledFont.OUTFIT, BundledFont.INTER), halfmoon.faces.map { it.font })
            assertEquals(mapOf("wght" to weight.toFloat()), halfmoon.faces[0].axes)
            assertEquals(mapOf("wght" to weight.toFloat(), "opsz" to 20f), halfmoon.faces[1].axes)
            val swiss = nativeFontPlan(CompanionFontStack.SWISS, weight, 20f)
            assertEquals(listOf(halfmoon.faces[1]), swiss.faces)
            for (plan in listOf(halfmoon, swiss)) {
                assertEquals(weight, plan.weight)
                assertEquals("sans-serif", plan.systemFallback) // CJK remains in Android's fallback chain.
            }
            assertTrue(nativeFontPlan(CompanionFontStack.RHINE, weight, 20f).faces.isEmpty())
        }
    }

    @Test fun opticalSizeClampsToInterRangeAndRetainsFractionalRoleSizes() {
        for ((size, expected) in listOf(11f to 14f, 14f to 14f, 16.8f to 16.8f, 28f to 28f, 57f to 32f, 112f to 32f)) {
            val face = nativeFontPlan(CompanionFontStack.SWISS, 600, size).faces.single()
            assertEquals(expected, face.axes["opsz"])
        }
    }

    @Test fun resolverReceivesEveryFinalRoleSizeAcrossRepeatedSystemSwitches() {
        // A test resolver makes family selection observable without pretending to run Android Minikin.
        for (core in CoreTheme.entries + CoreTheme.entries.reversed()) {
            val sizes = mutableListOf<Float>()
            val roles = companionTypography(core, CompanionFontResolver { stack, size ->
                sizes += size
                assertEquals(core.system.name, stack.name)
                FontFamily.Cursive
            })
            val material = with(roles.material) { listOf(displayLarge, displayMedium, displaySmall,
                headlineLarge, headlineMedium, headlineSmall, titleLarge, titleMedium, titleSmall,
                bodyLarge, bodyMedium, bodySmall, labelLarge, labelMedium, labelSmall) }
            val resolved = material + listOf(roles.supporting, roles.badge, roles.selectedTab, roles.readoutLabel) +
                if (core.system == DesignSystem.HALFMOON) emptyList() else listOf(roles.readoutValue)
            assertEquals(resolved.map { it.fontSize.value }.sorted(), sizes.sorted())
            resolved.forEach { assertEquals(FontFamily.Cursive, it.fontFamily) }
            assertEquals(if (core.system == DesignSystem.HALFMOON) FontFamily.Monospace else FontFamily.Cursive, roles.readoutValue.fontFamily)
        }
    }
}
