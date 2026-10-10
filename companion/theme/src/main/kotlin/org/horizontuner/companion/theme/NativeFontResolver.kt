package org.horizontuner.companion.theme

import android.content.Context
import android.graphics.Typeface
import android.graphics.fonts.Font
import android.graphics.fonts.FontFamily as AndroidFontFamily
import android.graphics.fonts.FontStyle as AndroidFontStyle
import android.graphics.fonts.FontVariationAxis
import androidx.compose.ui.text.font.AndroidFont
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontLoadingStrategy
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight

/** Compose's list selects weights; every entry loads a complete Android glyph-fallback chain. */
fun nativeFontFamily(stack: CompanionFontStack, opticalSize: Float): FontFamily {
    if (stack == CompanionFontStack.RHINE) return FontFamily.SansSerif
    return FontFamily((100..900 step 100).map { ChainFont(nativeFontPlan(stack, it, opticalSize)) })
}

private data class ChainFont(val plan: NativeFontPlan) : AndroidFont(
    FontLoadingStrategy.Blocking, ChainLoader, FontVariation.Settings(),
) {
    override val weight = FontWeight(plan.weight)
    override val style = FontStyle.Normal
}

private object ChainLoader : AndroidFont.TypefaceLoader {
    // Compose caches descriptors/results. This additional cache deduplicates the roles sharing opsz.
    // Only typefaces are retained, never Activity, Context, session or WebView references.
    private val cache = mutableMapOf<NativeFontPlan, Typeface>()

    @Synchronized
    override fun loadBlocking(context: Context, font: AndroidFont): Typeface = cache.getOrPut((font as ChainFont).plan) {
        val plan = font.plan
        val families = plan.faces.map { face ->
            val resource = when (face.font) {
                BundledFont.OUTFIT -> R.font.outfit_variable
                BundledFont.INTER -> R.font.inter_variable
            }
            val nativeFont = Font.Builder(context.resources, resource)
                .setFontVariationSettings(face.axes.map { (tag, value) -> FontVariationAxis(tag, value) }.toTypedArray())
                .setWeight(plan.weight).setSlant(AndroidFontStyle.FONT_SLANT_UPRIGHT).build()
            AndroidFontFamily.Builder(nativeFont).build()
        }
        val builder = Typeface.CustomFallbackBuilder(families.first())
        families.drop(1).forEach(builder::addCustomFallback)
        builder.setSystemFallback(plan.systemFallback)
            .setStyle(AndroidFontStyle(plan.weight, AndroidFontStyle.FONT_SLANT_UPRIGHT)).build()
    }

    override suspend fun awaitLoad(context: Context, font: AndroidFont): Typeface = loadBlocking(context, font)
}
