package org.horizontuner.companion.app

import org.horizontuner.companion.theme.*
import org.junit.Assert.*
import org.junit.Test

class ThemeSessionTest {
    private val originA = "http://192.168.1.20:8002"
    private val originB = "http://192.168.1.21:8002"
    private val light = VisualTheme(mode = ThemeMode.LIGHT, core = CoreTheme.EDITORIAL)
    private class MemoryCache : ThemeCache {
        val values = mutableMapOf<String, String>()
        override fun read(origin: String) = values[origin]
        override fun write(origin: String, raw: String) { values[origin] = raw }
    }
    @Test fun coldStartCorruptionOfflineReconnectAndRestartRetainLastValidTheme() {
        val cache = MemoryCache()
        cache.values[originA] = "corrupt"
        val session = ThemeSession(cache, originA)
        assertEquals(VisualTheme(), session.current)
        val lease = session.attach(originA)
        assertTrue(session.receive(VisualThemeCodec.encode(light), lease.generation, lease))
        assertTrue(session.bootstrap(lease).contains("\"mode\":\"light\""))
        assertFalse(session.receive("{}", lease.generation, lease))
        session.invalidate()
        assertEquals(light, session.current)
        assertFalse(session.receive(VisualThemeCodec.encode(VisualTheme()), lease.generation, lease))
        val next = session.attach(originA)
        assertNotEquals(lease.generation, next.generation)
        assertEquals(light, session.current)
        assertEquals(light, ThemeSession(cache, originA).current)
    }
    @Test fun hostSwitchRapidUpdatesAndLateCallbacksCannotPolluteAnotherEndpoint() {
        val cache = MemoryCache()
        val session = ThemeSession(cache, originA)
        val a = session.attach(originA)
        session.receive(VisualThemeCodec.encode(light), a.generation, a)
        val b = session.attach(originB)
        assertEquals(VisualTheme(), session.current)
        assertEquals("", session.bootstrap(a))
        assertFalse(session.receive(VisualThemeCodec.encode(light), a.generation, a))
        assertFalse(session.receive(VisualThemeCodec.encode(light), a.generation, b))
        for (core in CoreTheme.entries) {
            val value = light.copy(core = core)
            assertTrue(session.receive(VisualThemeCodec.encode(value), b.generation, b))
            assertEquals(value, session.current)
        }
        assertEquals(light, VisualThemeCodec.decode(cache.values[originA]))
        assertEquals(light.copy(core = CoreTheme.RHINE), ThemeSession(cache, originB).current)
        session.attach(originA)
        assertEquals(light, session.current)
    }
}
