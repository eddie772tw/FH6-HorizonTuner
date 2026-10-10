package org.horizontuner.companion.theme

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import org.junit.Assert.*
import org.junit.Test

class BundledFontResourcesTest {
    private fun bytes(path: String) = requireNotNull(javaClass.getResourceAsStream("/$path")) { path }.use { it.readBytes() }
    private fun digest(algorithm: String, value: ByteArray) = MessageDigest.getInstance(algorithm).digest(value).joinToString("") { "%02x".format(it) }

    @Test fun originalFontBytesMatchBothBinaryAndGitBlobHashes() {
        data class Expected(val name: String, val size: Int, val blob: String, val sha: String)
        for (font in listOf(
            Expected("outfit", 110884, "466d6245f9582df39bf73da91a8b3c938fd061cd", "fc7287273e66929776e2ba54f144fe699080bec29f61bf649d70d871468aeade"),
            Expected("inter", 876576, "047c92f6e2212473dc436020afed689527076d44", "29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031"),
        )) {
            val binary = bytes("font/${font.name}_variable.ttf")
            assertEquals(font.size, binary.size)
            assertEquals(font.sha, digest("SHA-256", binary))
            assertEquals(font.blob, digest("SHA-1", "blob ${binary.size}\u0000".toByteArray() + binary))
        }
    }

    @Test fun unmodifiedNoticesAndSourceMetadataRemainInPackagedAssets() {
        for ((name, sha) in mapOf(
            "Outfit-OFL.txt" to "c676351bf8576b9aba743cd5eaa8c0e7ee0d51f805d720447b4df4ddb6a2e416",
            "Inter-OFL.txt" to "5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57",
            "Inter-METADATA.pb" to "79e4721ef4f72251c6080a40dfd9efb6728b4df1fc690f0c70eb4b1b5303a5b0",
        )) assertEquals(sha, digest("SHA-256", bytes("font_notices/$name")))
    }

    @Test fun actualSfntTablesConfirmVersionsAxesAndNumericFeatureSupport() {
        for ((name, version) in listOf("outfit" to "Version 1.100", "inter" to "Version 4.001")) {
            val sfnt = Sfnt(bytes("font/${name}_variable.ttf"))
            assertTrue(sfnt.names(5).any { it.startsWith(version) })
            assertTrue(sfnt.names(0).any { it.contains(if (name == "outfit") "Outfit Project Authors" else "Inter Project Authors") })
            val axes = sfnt.axes()
            assertEquals(listOf(100f, if (name == "outfit") 100f else 400f, 900f), axes["wght"])
            assertEquals(if (name == "inter") listOf(14f, 14f, 32f) else null, axes["opsz"])
            assertEquals(if (name == "inter") setOf("wght", "opsz") else setOf("wght"), axes.keys)
            val features = sfnt.featureTags()
            assertTrue("tnum table missing in $name", "tnum" in features)
            val tabularWidths = sfnt.tabularDigitWidths()
            assertEquals("tnum must map 0..9 to equal advances in $name", 1, tabularWidths.toSet().size)
            assertTrue(tabularWidths.first() > 0)
            // Both fonts use lining digits by default; an explicit lnum feature may be absent.
            // Numeric-feature declarations alone are not a rendered-width/device acceptance.
        }
    }

    private class Sfnt(private val bytes: ByteArray) {
        private val b = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN)
        private fun u16(p: Int) = b.getShort(p).toInt() and 0xffff
        private fun tag(p: Int) = String(bytes, p, 4, Charsets.US_ASCII)
        private fun fixed(p: Int) = b.getInt(p) / 65536f
        private val tables = (0 until u16(4)).associate { i -> val p = 12 + i * 16; tag(p) to b.getInt(p + 8) }
        fun names(id: Int): List<String> {
            val p = tables.getValue("name")
            val start = p + u16(p + 4)
            return (0 until u16(p + 2)).map { p + 6 + it * 12 }.filter { u16(it + 6) == id }.map {
                String(bytes, start + u16(it + 10), u16(it + 8), if (u16(it) == 0 || u16(it) == 3) Charsets.UTF_16BE else Charsets.US_ASCII)
            }
        }
        fun axes(): Map<String, List<Float>> {
            val p = tables.getValue("fvar")
            return (0 until u16(p + 8)).associate { i ->
                val a = p + u16(p + 4) + i * u16(p + 10)
                tag(a) to listOf(fixed(a + 4), fixed(a + 8), fixed(a + 12))
            }
        }
        fun featureTags(): Set<String> {
            val p = tables.getValue("GSUB")
            val list = p + u16(p + 6)
            return (0 until u16(list)).map { tag(list + 2 + it * 6) }.toSet()
        }
        fun tabularDigitWidths(): List<Int> {
            val cmap = tables.getValue("cmap")
            val format4 = (0 until u16(cmap + 2)).map { cmap + 4 + it * 8 }
                .map { cmap + b.getInt(it + 4) }.first { u16(it) == 4 }
            val count = u16(format4 + 6) / 2
            val ends = format4 + 14
            val starts = ends + count * 2 + 2
            val deltas = starts + count * 2
            val ranges = deltas + count * 2
            fun glyph(code: Int): Int {
                val i = (0 until count).first { code <= u16(ends + it * 2) }
                require(code >= u16(starts + i * 2))
                val offset = u16(ranges + i * 2)
                val id = if (offset == 0) code else u16(ranges + i * 2 + offset + (code - u16(starts + i * 2)) * 2)
                return (id + b.getShort(deltas + i * 2).toInt()) and 0xffff
            }
            fun coverageIndex(p: Int, glyph: Int): Int = when (u16(p)) {
                1 -> (0 until u16(p + 2)).firstOrNull { u16(p + 4 + it * 2) == glyph } ?: -1
                2 -> (0 until u16(p + 2)).map { p + 4 + it * 6 }.firstOrNull { glyph in u16(it)..u16(it + 2) }
                    ?.let { u16(it + 4) + glyph - u16(it) } ?: -1
                else -> error("Unsupported coverage")
            }
            val gsub = tables.getValue("GSUB")
            val features = gsub + u16(gsub + 6)
            val feature = (0 until u16(features)).map { features + 2 + it * 6 }.first { tag(it) == "tnum" }
                .let { features + u16(it + 4) }
            val lookupList = gsub + u16(gsub + 8)
            val lookups = (0 until u16(feature + 2)).map { u16(feature + 4 + it * 2) }
                .map { lookupList + u16(lookupList + 2 + it * 2) }
            val metricCount = u16(tables.getValue("hhea") + 34)
            return ('0'.code..'9'.code).map { code ->
                var id = glyph(code)
                require(id != 0)
                for (lookup in lookups) {
                    require(u16(lookup) == 1) { "Expected pinned font's single-substitution tnum lookup" }
                    for (i in 0 until u16(lookup + 4)) {
                        val sub = lookup + u16(lookup + 6 + i * 2)
                        val index = coverageIndex(sub + u16(sub + 2), id)
                        if (index >= 0) {
                            id = when (u16(sub)) {
                                1 -> (id + b.getShort(sub + 4)) and 0xffff
                                2 -> u16(sub + 6 + index * 2)
                                else -> error("Unsupported substitution")
                            }
                            break
                        }
                    }
                }
                u16(tables.getValue("hmtx") + id.coerceAtMost(metricCount - 1) * 4)
            }
        }
    }
}
