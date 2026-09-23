package org.horizontuner.companion.core.model

/**
 * Data model for Forza Horizon 60Hz 324-byte UDP Data Out telemetry packet.
 * Byte order: Little-Endian.
 */
data class ForzaTelemetryPacket(
    val isRaceOn: Boolean,
    val timestampMs: Long,
    val engineMaxRpm: Float,
    val engineIdleRpm: Float,
    val currentEngineRpm: Float,
    val accelerationX: Float,
    val accelerationY: Float,
    val accelerationZ: Float,
    val velocityX: Float,
    val velocityY: Float,
    val velocityZ: Float,
    val angularVelocityX: Float,
    val angularVelocityY: Float,
    val angularVelocityZ: Float,
    val yaw: Float,
    val pitch: Float,
    val roll: Float,
    val normalizedSuspensionTravelFL: Float,
    val normalizedSuspensionTravelFR: Float,
    val normalizedSuspensionTravelRL: Float,
    val normalizedSuspensionTravelRR: Float,
    val tireSlipRatioFL: Float,
    val tireSlipRatioFR: Float,
    val tireSlipRatioRL: Float,
    val tireSlipRatioRR: Float,
    val wheelRotationSpeedFL: Float,
    val wheelRotationSpeedFR: Float,
    val wheelRotationSpeedRL: Float,
    val wheelRotationSpeedRR: Float,
    val wheelOnRumbleStripFL: Boolean,
    val wheelOnRumbleStripFR: Boolean,
    val wheelOnRumbleStripRL: Boolean,
    val wheelOnRumbleStripRR: Boolean,
    val wheelInPuddleDepthFL: Float,
    val wheelInPuddleDepthFR: Float,
    val wheelInPuddleDepthRL: Float,
    val wheelInPuddleDepthRR: Float,
    val surfaceRumbleFL: Float,
    val surfaceRumbleFR: Float,
    val surfaceRumbleRL: Float,
    val surfaceRumbleRR: Float,
    val tireSlipAngleFL: Float,
    val tireSlipAngleFR: Float,
    val tireSlipAngleRL: Float,
    val tireSlipAngleRR: Float,
    val tireCombinedSlipFL: Float,
    val tireCombinedSlipFR: Float,
    val tireCombinedSlipRL: Float,
    val tireCombinedSlipRR: Float,
    val suspensionTravelMetersFL: Float,
    val suspensionTravelMetersFR: Float,
    val suspensionTravelMetersRL: Float,
    val suspensionTravelMetersRR: Float,
    val carOrdinal: Int,
    val carClass: Int,
    val carPerformanceIndex: Int,
    val drivetrainType: Int, // 0: FWD, 1: RWD, 2: AWD
    val numCylinders: Int,
    val positionX: Float,
    val positionY: Float,
    val positionZ: Float,
    val speedMps: Float,
    val powerWatts: Float,
    val torqueNm: Float,
    val tireTempFL: Float,
    val tireTempFR: Float,
    val tireTempRL: Float,
    val tireTempRR: Float,
    val boost: Float,
    val fuel: Float,
    val distanceTraveled: Float,
    val bestLap: Float,
    val lastLap: Float,
    val currentLap: Float,
    val currentRaceTime: Float,
    val lapNumber: Int,
    val racePosition: Int,
    val accel: Int,     // 0-255
    val brake: Int,     // 0-255
    val clutch: Int,    // 0-255
    val handbrake: Int, // 0-255
    val gear: Int,      // 0: Reverse, 1+: Forward
    val steer: Int,     // -127 to 127
    val normalizedDrivingLine: Int,
    val normalizedAIBrakeDifference: Int
) {
    // --- Computed Ergonomic Helpers ---
    val speedKph: Float get() = speedMps * 3.6f
    val speedMph: Float get() = speedMps * 2.23694f
    val powerHp: Float get() = powerWatts * 0.00134102f
    val accelNormalized: Float get() = (accel and 0xFF) / 255.0f
    val brakeNormalized: Float get() = (brake and 0xFF) / 255.0f
    val clutchNormalized: Float get() = (clutch and 0xFF) / 255.0f
    val handbrakeNormalized: Float get() = (handbrake and 0xFF) / 255.0f
    val steerNormalized: Float get() = steer / 127.0f
}
