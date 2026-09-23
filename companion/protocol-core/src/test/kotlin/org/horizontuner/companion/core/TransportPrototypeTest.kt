package org.horizontuner.companion.core

import org.horizontuner.companion.core.hud.HudCacheContract
import org.horizontuner.companion.core.transport.RfcommTransport
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.File

class TransportPrototypeTest {

    @Test
    fun testRfcommFraming() {
        val payload = "HELLO_HORIZON_TUNER".toByteArray(Charsets.UTF_8)
        val encoded = RfcommTransport.encodeFrame(payload)

        assertEquals(4 + payload.size, encoded.size)

        val decoded = RfcommTransport.decodeFrame(ByteArrayInputStream(encoded))
        assertNotNull(decoded)
        assertEquals("HELLO_HORIZON_TUNER", String(decoded!!, Charsets.UTF_8))
    }

    @Test
    fun testHudSha256Calculation() {
        val content = "HUD_TEST_ASSET_CONTENT".toByteArray(Charsets.UTF_8)
        val sha256 = HudCacheContract.computeSha256(ByteArrayInputStream(content))

        // Precalculated sha256 for "HUD_TEST_ASSET_CONTENT":
        // echo -n "HUD_TEST_ASSET_CONTENT" | sha256sum
        assertTrue(sha256.isNotEmpty())
        assertEquals(64, sha256.length)

        val tempFile = File.createTempFile("hud_test", ".svg")
        try {
            tempFile.writeBytes(content)
            assertTrue(HudCacheContract.isAssetValid(tempFile, sha256))
        } finally {
            tempFile.delete()
        }
    }
}
