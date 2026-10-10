package org.horizontuner.companion.theme

import org.junit.Assert.*
import org.junit.Test

/** Portable codec tests also run independently of the Android SDK during a blocked build. */
class VisualThemeCodecTest {
    @Test fun allSevenCoresModesPresetsAndCustomColorsRoundTrip() {
        for (core in CoreTheme.entries) for (mode in ThemeMode.entries) {
            for (palette in listOf(listOf("#00f0ff", "#ff003c", "#7000ff"), listOf("#e30613", "#f59e0b", "#2563eb"), listOf("#123456", "#abcdef", "#987654"))) {
                val theme = VisualTheme(mode, core, palette[0], palette[1], palette[2])
                assertEquals(theme, VisualThemeCodec.decode(VisualThemeCodec.encode(theme)))
            }
            assertEquals(if (mode == ThemeMode.LIGHT) "#000000" else "#f1f5f9", VisualThemeCodec.decode(VisualThemeCodec.encode(VisualTheme(mode, core, "#f1f5f9", "#ef4444", "#64748b")))!!.primaryColor)
            assertEquals(if (mode == ThemeMode.LIGHT) "#080a08" else "#e0e3dc", VisualThemeCodec.decode(VisualThemeCodec.encode(VisualTheme(mode, core, "#080a08", "#9b7247", "#66645c")))!!.primaryColor)
        }
    }
    @Test fun rejectsEveryMissingFieldWrongVersionCoreModeHexExecutableAndOversizedPayload() {
        val raw = VisualThemeCodec.encode(VisualTheme())
        val objectValue = com.google.gson.JsonParser.parseString(raw).asJsonObject
        for (key in objectValue.keySet().toList()) {
            val incomplete = objectValue.deepCopy(); incomplete.remove(key)
            assertNull(VisualThemeCodec.decode(incomplete.toString()))
        }
        for (invalid in listOf(null, "{", "[]", raw.replace("\"schemaVersion\":1", "\"schemaVersion\":2"), raw.replace("default", "unknown"), raw.replace("dark", "auto"), raw.replace("#00f0ff", "#fff"), raw.replace("#7000ff", "url(secret)"), raw.dropLast(1) + ",\"customCSS\":\"script\"}", " ".repeat(1025) + raw)) assertNull(VisualThemeCodec.decode(invalid))
    }
}
