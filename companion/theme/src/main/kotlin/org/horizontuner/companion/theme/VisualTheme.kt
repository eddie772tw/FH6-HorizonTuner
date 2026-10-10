package org.horizontuner.companion.theme

import com.google.gson.GsonBuilder
import com.google.gson.JsonObject
import com.google.gson.Strictness

enum class DesignSystem { HALFMOON, SWISS, RHINE }
enum class CoreTheme(val id: String, val system: DesignSystem) {
    DEFAULT("default", DesignSystem.HALFMOON), MODERN("modern", DesignSystem.HALFMOON),
    ELEGANT("elegant", DesignSystem.HALFMOON), SWISS("swiss", DesignSystem.SWISS),
    EDITORIAL("swiss-editorial", DesignSystem.SWISS), CONTRAST("swiss-contrast", DesignSystem.SWISS),
    RHINE("rhine-lab", DesignSystem.RHINE),
}
enum class ThemeMode(val id: String) { LIGHT("light"), DARK("dark") }

data class VisualTheme(
    val mode: ThemeMode = ThemeMode.DARK,
    val core: CoreTheme = CoreTheme.DEFAULT,
    val primaryColor: String = "#00f0ff",
    val secondaryColor: String = "#ff003c",
    val accentColor: String = "#7000ff",
)

/** The only native theme input: six fields, no CSS, URLs, credentials or partial updates. */
object VisualThemeCodec {
    const val MAX_BYTES = 1024
    private val gson = GsonBuilder().setStrictness(Strictness.STRICT).create()
    private val keys = setOf("schemaVersion", "mode", "halfmoonCore", "primaryColor", "secondaryColor", "accentColor")
    private val hex = Regex("#[0-9a-fA-F]{6}")
    fun decode(raw: String?): VisualTheme? = runCatching {
        require(raw != null && raw.length <= MAX_BYTES && raw.toByteArray(Charsets.UTF_8).size <= MAX_BYTES)
        val value = gson.fromJson(raw, JsonObject::class.java)
        require(value.keySet() == keys && value["schemaVersion"].isJsonPrimitive && value["schemaVersion"].asJsonPrimitive.isNumber && value["schemaVersion"].toString() == "1")
        fun string(key: String): String {
            val item = value[key]
            require(item.isJsonPrimitive && item.asJsonPrimitive.isString)
            return item.asString
        }
        val mode = ThemeMode.entries.single { it.id == string("mode") }
        val core = CoreTheme.entries.single { it.id == string("halfmoonCore") }
        fun color(key: String) = string(key).also { require(hex.matches(it)) }
        normalize(VisualTheme(mode, core, color("primaryColor"), color("secondaryColor"), color("accentColor")))
    }.getOrNull()

    // Matches themeSettings.ts: recognize complete built-in palettes, preserve custom colors.
    private fun normalize(theme: VisualTheme): VisualTheme {
        val colors = listOf(theme.primaryColor, theme.secondaryColor, theme.accentColor).map(String::lowercase)
        if (colors[0] in listOf("#f1f5f9", "#000000") && colors.drop(1) == listOf("#ef4444", "#64748b")) {
            return theme.copy(primaryColor = if (theme.mode == ThemeMode.LIGHT) "#000000" else "#f1f5f9")
        }
        val light = listOf("#080a08", "#9b7247", "#66645c")
        val dark = listOf("#e0e3dc", "#c5a16b", "#a6b0b1")
        if (colors == light || colors == dark) {
            val palette = if (theme.mode == ThemeMode.LIGHT) light else dark
            return theme.copy(primaryColor = palette[0], secondaryColor = palette[1], accentColor = palette[2])
        }
        return theme
    }

    fun encode(theme: VisualTheme): String = JsonObject().apply {
        addProperty("schemaVersion", 1)
        addProperty("mode", theme.mode.id)
        addProperty("halfmoonCore", theme.core.id)
        addProperty("primaryColor", theme.primaryColor)
        addProperty("secondaryColor", theme.secondaryColor)
        addProperty("accentColor", theme.accentColor)
    }.toString()
}
