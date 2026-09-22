package org.horizontuner.companion.core

import org.horizontuner.companion.core.decoder.ForzaPacketDecoder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

class ForzaPacketDecoderTest {

    @Test
    fun testRejectTooShortPacket() {
        val shortBytes = ByteArray(323)
        assertNull(ForzaPacketDecoder.decode(shortBytes))
    }

    @Test
    fun testDecodeSyntheticPacket() {
        val bytes = ByteArray(324)
        val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)

        // isRaceOn = 1
        buf.putInt(0, 1)
        // timestampMs = 123456
        buf.putInt(4, 123456)
        // engineMaxRpm = 8000.0f
        buf.putFloat(8, 8000.0f)
        // currentEngineRpm = 4500.0f
        buf.putFloat(16, 4500.0f)
        // speedMps = 27.7778f (approx 100 km/h)
        buf.putFloat(244, 27.7778f)
        // powerWatts = 250000.0f
        buf.putFloat(248, 250000.0f)
        // torqueNm = 350.0f
        buf.putFloat(252, 350.0f)

        // LapNumber = 3
        buf.putShort(300, 3.toShort())
        // RacePosition = 2
        bytes[302] = 2.toByte()
        // AccelInput = 255 (100%)
        bytes[303] = 255.toByte()
        // BrakeInput = 0
        bytes[304] = 0.toByte()
        // ClutchInput = 0
        bytes[305] = 0.toByte()
        // HandBrakeInput = 0
        bytes[306] = 0.toByte()
        // Gear = 4
        bytes[307] = 4.toByte()
        // Steer = -64
        bytes[308] = (-64).toByte()

        val packet = ForzaPacketDecoder.decode(bytes)
        assertNotNull(packet)
        packet!!

        assertTrue(packet.isRaceOn)
        assertEquals(123456L, packet.timestampMs)
        assertEquals(8000.0f, packet.engineMaxRpm, 0.001f)
        assertEquals(4500.0f, packet.currentEngineRpm, 0.001f)
        assertEquals(27.7778f, packet.speedMps, 0.001f)
        assertEquals(100.0f, packet.speedKph, 0.1f)
        assertEquals(3, packet.lapNumber)
        assertEquals(2, packet.racePosition)
        assertEquals(255, packet.accel)
        assertEquals(1.0f, packet.accelNormalized, 0.001f)
        assertEquals(0, packet.brake)
        assertEquals(0.0f, packet.brakeNormalized, 0.001f)
        assertEquals(4, packet.gear)
        assertEquals(-64, packet.steer)
    }
}
