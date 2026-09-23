package org.horizontuner.companion.core.transport

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import org.horizontuner.companion.core.model.ForzaTelemetryPacket

/**
 * Unified transport contract for Companion APP communication channels (LAN, USB, Bluetooth).
 */
interface ITransport {
    val state: StateFlow<TransportState>

    /**
     * Connect to the host using configured endpoint parameters.
     */
    suspend fun connect(): Result<Unit>

    /**
     * Send string message (e.g. JSON RPC or command) to host.
     */
    suspend fun send(data: String): Result<Unit>

    /**
     * Send binary data frame to host.
     */
    suspend fun sendBytes(data: ByteArray): Result<Unit>

    /**
     * Gracefully disconnect transport.
     */
    suspend fun disconnect()

    /**
     * Flow of decoded 60Hz telemetry packets.
     */
    val incomingPackets: Flow<ForzaTelemetryPacket>

    /**
     * Flow of raw JSON text frames from host (status, RPC, events).
     */
    val incomingRawJson: Flow<String>
}
