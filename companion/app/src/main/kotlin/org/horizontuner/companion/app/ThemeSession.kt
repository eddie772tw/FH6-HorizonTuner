package org.horizontuner.companion.app

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import org.horizontuner.companion.theme.VisualTheme
import org.horizontuner.companion.theme.VisualThemeCodec
import java.util.UUID

internal interface ThemeCache {
    fun read(origin: String): String?
    fun write(origin: String, raw: String)
}

internal data class ThemeLease(val origin: String, val generation: String = UUID.randomUUID().toString())

/** Main-thread owner. Every connection/page load gets a fresh lease; old callbacks cannot write. */
internal class ThemeSession(private val cache: ThemeCache, initialOrigin: String?) {
    private var currentOrigin = initialOrigin
    private fun cached(origin: String) = runCatching { VisualThemeCodec.decode(cache.read(origin)) }.getOrNull()
    var current: VisualTheme = initialOrigin?.let(::cached) ?: VisualTheme()
        private set
    var lease: ThemeLease? = null
        private set

    fun attach(origin: String): ThemeLease {
        if (currentOrigin != origin) {
            current = cached(origin) ?: VisualTheme()
            currentOrigin = origin
        }
        return ThemeLease(origin).also { lease = it }
    }

    fun invalidate() { lease = null }

    fun bootstrap(expected: ThemeLease): String {
        if (lease != expected) return ""
        return JsonObject().apply {
            addProperty("origin", expected.origin)
            addProperty("generation", expected.generation)
            add("visualTheme", JsonParser.parseString(VisualThemeCodec.encode(current)))
        }.toString()
    }

    fun receive(raw: String, generation: String, expected: ThemeLease): Boolean {
        if (lease != expected || generation != expected.generation) return false
        val visual = VisualThemeCodec.decode(raw) ?: return false
        if (visual != current) {
            current = visual
            runCatching { cache.write(expected.origin, VisualThemeCodec.encode(visual)) }
        }
        return true
    }
}
