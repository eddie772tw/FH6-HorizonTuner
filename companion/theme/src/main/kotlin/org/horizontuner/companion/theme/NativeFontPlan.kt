package org.horizontuner.companion.theme

/** Audited, unmodified Android resources; MiSans remains a separate unresolved source/license gate. */
enum class BundledFont { OUTFIT, INTER }

data class NativeFontFace(val font: BundledFont, val axes: Map<String, Float>)
data class NativeFontPlan(val faces: List<NativeFontFace>, val weight: Int, val systemFallback: String = "sans-serif")

/** opsz follows the role's effective size in dp (including Android font scaling), clamped to Inter's fvar. */
fun nativeFontPlan(stack: CompanionFontStack, weight: Int, opticalSize: Float): NativeFontPlan {
    require(weight in 100..900)
    require(opticalSize.isFinite() && opticalSize > 0)
    val inter = NativeFontFace(BundledFont.INTER, mapOf("wght" to weight.toFloat(), "opsz" to opticalSize.coerceIn(14f, 32f)))
    val faces = when (stack) {
        CompanionFontStack.HALFMOON -> listOf(NativeFontFace(BundledFont.OUTFIT, mapOf("wght" to weight.toFloat())), inter)
        CompanionFontStack.SWISS -> listOf(inter)
        CompanionFontStack.RHINE -> emptyList()
    }
    return NativeFontPlan(faces, weight)
}
