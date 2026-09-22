package org.horizontuner.companion.core.decoder

import org.horizontuner.companion.core.model.ForzaTelemetryPacket
import java.nio.ByteBuffer
import java.nio.ByteOrder

object ForzaPacketDecoder {
    const val FULL_PACKET_LENGTH = 324

    /**
     * Decode a 324-byte Forza Horizon Data Out binary packet into a strongly typed [ForzaTelemetryPacket].
     * Returns null if packet length does not match or data is corrupted.
     */
    fun decode(bytes: ByteArray): ForzaTelemetryPacket? {
        if (bytes.size < FULL_PACKET_LENGTH) return null

        val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)

        val isRaceOn = buf.getInt(0) != 0
        val timestampMs = buf.getInt(4).toLong() and 0xFFFFFFFFL
        val engineMaxRpm = buf.getFloat(8)
        val engineIdleRpm = buf.getFloat(12)
        val currentEngineRpm = buf.getFloat(16)
        val accelerationX = buf.getFloat(20)
        val accelerationY = buf.getFloat(24)
        val accelerationZ = buf.getFloat(28)
        val velocityX = buf.getFloat(32)
        val velocityY = buf.getFloat(36)
        val velocityZ = buf.getFloat(40)
        val angularVelocityX = buf.getFloat(44)
        val angularVelocityY = buf.getFloat(48)
        val angularVelocityZ = buf.getFloat(52)
        val yaw = buf.getFloat(56)
        val pitch = buf.getFloat(60)
        val roll = buf.getFloat(64)

        val normalizedSuspensionTravelFL = buf.getFloat(68)
        val normalizedSuspensionTravelFR = buf.getFloat(72)
        val normalizedSuspensionTravelRL = buf.getFloat(76)
        val normalizedSuspensionTravelRR = buf.getFloat(80)

        val tireSlipRatioFL = buf.getFloat(84)
        val tireSlipRatioFR = buf.getFloat(88)
        val tireSlipRatioRL = buf.getFloat(92)
        val tireSlipRatioRR = buf.getFloat(96)

        val wheelRotationSpeedFL = buf.getFloat(100)
        val wheelRotationSpeedFR = buf.getFloat(104)
        val wheelRotationSpeedRL = buf.getFloat(108)
        val wheelRotationSpeedRR = buf.getFloat(112)

        val wheelOnRumbleStripFL = buf.getInt(116) != 0
        val wheelOnRumbleStripFR = buf.getInt(120) != 0
        val wheelOnRumbleStripRL = buf.getInt(124) != 0
        val wheelOnRumbleStripRR = buf.getInt(128) != 0

        val wheelInPuddleDepthFL = buf.getFloat(132)
        val wheelInPuddleDepthFR = buf.getFloat(136)
        val wheelInPuddleDepthRL = buf.getFloat(140)
        val wheelInPuddleDepthRR = buf.getFloat(144)

        val surfaceRumbleFL = buf.getFloat(148)
        val surfaceRumbleFR = buf.getFloat(152)
        val surfaceRumbleRL = buf.getFloat(156)
        val surfaceRumbleRR = buf.getFloat(160)

        val tireSlipAngleFL = buf.getFloat(164)
        val tireSlipAngleFR = buf.getFloat(168)
        val tireSlipAngleRL = buf.getFloat(172)
        val tireSlipAngleRR = buf.getFloat(176)

        val tireCombinedSlipFL = buf.getFloat(180)
        val tireCombinedSlipFR = buf.getFloat(184)
        val tireCombinedSlipRL = buf.getFloat(188)
        val tireCombinedSlipRR = buf.getFloat(192)

        val suspensionTravelMetersFL = buf.getFloat(196)
        val suspensionTravelMetersFR = buf.getFloat(200)
        val suspensionTravelMetersRL = buf.getFloat(204)
        val suspensionTravelMetersRR = buf.getFloat(208)

        val carOrdinal = buf.getInt(212)
        val carClass = buf.getInt(216)
        val carPerformanceIndex = buf.getInt(220)
        val drivetrainType = buf.getInt(224)
        val numCylinders = buf.getInt(228)

        val positionX = buf.getFloat(232)
        val positionY = buf.getFloat(236)
        val positionZ = buf.getFloat(240)
        val speedMps = buf.getFloat(244)
        val powerWatts = buf.getFloat(248)
        val torqueNm = buf.getFloat(252)

        val tireTempFL = buf.getFloat(256)
        val tireTempFR = buf.getFloat(260)
        val tireTempRL = buf.getFloat(264)
        val tireTempRR = buf.getFloat(268)

        val boost = buf.getFloat(272)
        val fuel = buf.getFloat(276)
        val distanceTraveled = buf.getFloat(280)
        val bestLap = buf.getFloat(284)
        val lastLap = buf.getFloat(288)
        val currentLap = buf.getFloat(292)
        val currentRaceTime = buf.getFloat(296)

        val lapNumber = buf.getShort(300).toInt() and 0xFFFF
        val racePosition = bytes[302].toInt() and 0xFF
        val accel = bytes[303].toInt() and 0xFF
        val brake = bytes[304].toInt() and 0xFF
        val clutch = bytes[305].toInt() and 0xFF
        val handbrake = bytes[306].toInt() and 0xFF
        val gear = bytes[307].toInt() and 0xFF
        val steer = bytes[308].toInt() // signed i8
        val normalizedDrivingLine = bytes[309].toInt()
        val normalizedAIBrakeDifference = bytes[310].toInt()

        return ForzaTelemetryPacket(
            isRaceOn = isRaceOn,
            timestampMs = timestampMs,
            engineMaxRpm = engineMaxRpm,
            engineIdleRpm = engineIdleRpm,
            currentEngineRpm = currentEngineRpm,
            accelerationX = accelerationX,
            accelerationY = accelerationY,
            accelerationZ = accelerationZ,
            velocityX = velocityX,
            velocityY = velocityY,
            velocityZ = velocityZ,
            angularVelocityX = angularVelocityX,
            angularVelocityY = angularVelocityY,
            angularVelocityZ = angularVelocityZ,
            yaw = yaw,
            pitch = pitch,
            roll = roll,
            normalizedSuspensionTravelFL = normalizedSuspensionTravelFL,
            normalizedSuspensionTravelFR = normalizedSuspensionTravelFR,
            normalizedSuspensionTravelRL = normalizedSuspensionTravelRL,
            normalizedSuspensionTravelRR = normalizedSuspensionTravelRR,
            tireSlipRatioFL = tireSlipRatioFL,
            tireSlipRatioFR = tireSlipRatioFR,
            tireSlipRatioRL = tireSlipRatioRL,
            tireSlipRatioRR = tireSlipRatioRR,
            wheelRotationSpeedFL = wheelRotationSpeedFL,
            wheelRotationSpeedFR = wheelRotationSpeedFR,
            wheelRotationSpeedRL = wheelRotationSpeedRL,
            wheelRotationSpeedRR = wheelRotationSpeedRR,
            wheelOnRumbleStripFL = wheelOnRumbleStripFL,
            wheelOnRumbleStripFR = wheelOnRumbleStripFR,
            wheelOnRumbleStripRL = wheelOnRumbleStripRL,
            wheelOnRumbleStripRR = wheelOnRumbleStripRR,
            wheelInPuddleDepthFL = wheelInPuddleDepthFL,
            wheelInPuddleDepthFR = wheelInPuddleDepthFR,
            wheelInPuddleDepthRL = wheelInPuddleDepthRL,
            wheelInPuddleDepthRR = wheelInPuddleDepthRR,
            surfaceRumbleFL = surfaceRumbleFL,
            surfaceRumbleFR = surfaceRumbleFR,
            surfaceRumbleRL = surfaceRumbleRL,
            surfaceRumbleRR = surfaceRumbleRR,
            tireSlipAngleFL = tireSlipAngleFL,
            tireSlipAngleFR = tireSlipAngleFR,
            tireSlipAngleRL = tireSlipAngleRL,
            tireSlipAngleRR = tireSlipAngleRR,
            tireCombinedSlipFL = tireCombinedSlipFL,
            tireCombinedSlipFR = tireCombinedSlipFR,
            tireCombinedSlipRL = tireCombinedSlipRL,
            tireCombinedSlipRR = tireCombinedSlipRR,
            suspensionTravelMetersFL = suspensionTravelMetersFL,
            suspensionTravelMetersFR = suspensionTravelMetersFR,
            suspensionTravelMetersRL = suspensionTravelMetersRL,
            suspensionTravelMetersRR = suspensionTravelMetersRR,
            carOrdinal = carOrdinal,
            carClass = carClass,
            carPerformanceIndex = carPerformanceIndex,
            drivetrainType = drivetrainType,
            numCylinders = numCylinders,
            positionX = positionX,
            positionY = positionY,
            positionZ = positionZ,
            speedMps = speedMps,
            powerWatts = powerWatts,
            torqueNm = torqueNm,
            tireTempFL = tireTempFL,
            tireTempFR = tireTempFR,
            tireTempRL = tireTempRL,
            tireTempRR = tireTempRR,
            boost = boost,
            fuel = fuel,
            distanceTraveled = distanceTraveled,
            bestLap = bestLap,
            lastLap = lastLap,
            currentLap = currentLap,
            currentRaceTime = currentRaceTime,
            lapNumber = lapNumber,
            racePosition = racePosition,
            accel = accel,
            brake = brake,
            clutch = clutch,
            handbrake = handbrake,
            gear = gear,
            steer = steer,
            normalizedDrivingLine = normalizedDrivingLine,
            normalizedAIBrakeDifference = normalizedAIBrakeDifference
        )
    }
}
