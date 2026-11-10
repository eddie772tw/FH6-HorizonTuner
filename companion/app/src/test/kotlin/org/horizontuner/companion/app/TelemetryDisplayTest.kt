package org.horizontuner.companion.app

import org.junit.Assert.*
import org.junit.Test

class TelemetryDisplayTest {
    @Test fun convertsGameUnitsAndSpecialGears() {
        val reading = mainInstrumentReading(25.0, 4000.0, 8000.0, 3)
        assertEquals(90, reading.speedKmh)
        assertEquals(4000, reading.rpm)
        assertEquals(0.5f, reading.rpmFraction)
        assertEquals("3", reading.gear)
        assertEquals("R", mainInstrumentReading(null, null, null, 0).gear)
        assertEquals("N", mainInstrumentReading(null, null, null, 11).gear)
    }
    @Test fun missingOrInvalidSamplesNeverRenderAsLiveZeroOrInvalidProgress() {
        val missing = mainInstrumentReading(null, Double.NaN, 0.0, null)
        assertNull(missing.speedKmh)
        assertNull(missing.rpm)
        assertEquals("—", missing.gear)
        assertEquals(0f, missing.rpmFraction)
        assertEquals(1f, mainInstrumentReading(0.0, 9000.0, 8000.0, 2).rpmFraction)
    }
}
