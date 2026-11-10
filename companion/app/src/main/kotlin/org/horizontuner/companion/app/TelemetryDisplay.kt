package org.horizontuner.companion.app

/** Display conversion only; Forza sends speed in m/s and engine speed in RPM. */
internal data class MainInstrumentReading(val speedKmh: Int?, val rpm: Int?, val gear: String, val rpmFraction: Float)

internal fun mainInstrumentReading(speedMetersPerSecond: Double?, rpm: Double?, maxRpm: Double?, gear: Int?): MainInstrumentReading {
    val validRpm = rpm?.takeIf { it.isFinite() && it >= 0 }
    return MainInstrumentReading(
        speedMetersPerSecond?.takeIf { it.isFinite() && it >= 0 }?.times(3.6)?.toInt(),
        validRpm?.toInt(),
        when (gear) { null -> "—"; 0 -> "R"; 11 -> "N"; in 1..10 -> gear.toString(); else -> "—" },
        if (validRpm != null && maxRpm != null && maxRpm.isFinite() && maxRpm > 0) (validRpm / maxRpm).toFloat().coerceIn(0f, 1f) else 0f,
    )
}

internal fun inputPercent(raw: Double, steering: Boolean = false): Float =
    if (raw.isFinite()) (raw / (if (steering) 127.0 else 255.0) * 100).toFloat().coerceIn(if (steering) -100f else 0f, 100f) else 0f
