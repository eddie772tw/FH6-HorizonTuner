package org.horizontuner.companion.core

import org.horizontuner.companion.core.transport.telemetryRequest
import org.junit.Assert.*
import org.junit.Test

class NativeTelemetryAuthenticationTest {
    @Test fun lanSessionUsesCookieAndKeepsSecretsOutOfUrls() {
        val request = telemetryRequest("192.168.1.10", 8002, "paired-session", false, true)
        assertTrue(request.url.isHttps)
        assertEquals("/ws/telemetry", request.url.encodedPath)
        assertNull(request.url.query)
        assertFalse(request.url.toString().contains("paired-session"))
        assertEquals("companion_session=paired-session", request.header("Cookie"))
    }
    @Test fun usbBinaryTransportDoesNotRequireLanCredentials() {
        val request = telemetryRequest("127.0.0.1", 8001, null, true, false)
        assertFalse(request.url.isHttps)
        assertEquals("/ws/telemetry/binary", request.url.encodedPath)
        assertNull(request.header("Cookie"))
    }
}
