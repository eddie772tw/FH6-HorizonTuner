package org.horizontuner.companion.core.transport

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import org.horizontuner.companion.core.decoder.ForzaPacketDecoder
import org.horizontuner.companion.core.model.ForzaTelemetryPacket
import java.io.InputStream
import java.io.OutputStream
import java.nio.ByteBuffer

/**
 * Working prototype for Bluetooth Classic RFCOMM transport, adapted from PadLink wire protocol.
 * Uses 4-byte big-endian framing for stream reliability over serial/RFCOMM sockets.
 */
class RfcommTransport(
    private val inputStreamProvider: (() -> InputStream)? = null,
    private val outputStreamProvider: (() -> OutputStream)? = null
) : ITransport {

    private val _state = MutableStateFlow(TransportState.DISCONNECTED)
    override val state: StateFlow<TransportState> = _state.asStateFlow()

    private val _incomingPackets = MutableSharedFlow<ForzaTelemetryPacket>(extraBufferCapacity = 64)
    override val incomingPackets: Flow<ForzaTelemetryPacket> = _incomingPackets.asSharedFlow()

    private val _incomingRawJson = MutableSharedFlow<String>(extraBufferCapacity = 64)
    override val incomingRawJson: Flow<String> = _incomingRawJson.asSharedFlow()

    private var outputStream: OutputStream? = null
    private var isRunning = false

    companion object {
        const val MAX_FRAME_SIZE = 16 * 1024 // 16 KB

        fun encodeFrame(payload: ByteArray): ByteArray {
            val buf = ByteBuffer.allocate(4 + payload.size)
            buf.putInt(payload.size)
            buf.put(payload)
            return buf.array()
        }

        fun decodeFrame(input: InputStream): ByteArray? {
            val header = ByteArray(4)
            var read = 0
            while (read < 4) {
                val count = input.read(header, read, 4 - read)
                if (count == -1) return null
                read += count
            }
            val length = ByteBuffer.wrap(header).int
            if (length <= 0 || length > MAX_FRAME_SIZE) return null

            val payload = ByteArray(length)
            read = 0
            while (read < length) {
                val count = input.read(payload, read, length - read)
                if (count == -1) return null
                read += count
            }
            return payload
        }
    }

    override suspend fun connect(): Result<Unit> = runCatching {
        if (inputStreamProvider == null || outputStreamProvider == null) {
            _state.value = TransportState.CONNECTED
            return@runCatching // Mock/prototype mode
        }

        _state.value = TransportState.CONNECTING
        outputStream = outputStreamProvider.invoke()
        val inputStream = inputStreamProvider.invoke()
        _state.value = TransportState.STREAMING
        isRunning = true

        Thread {
            try {
                while (isRunning) {
                    val frame = decodeFrame(inputStream) ?: break
                    if (frame.size == ForzaPacketDecoder.FULL_PACKET_LENGTH) {
                        val packet = ForzaPacketDecoder.decode(frame)
                        if (packet != null) {
                            _incomingPackets.tryEmit(packet)
                        }
                    } else {
                        val text = String(frame, Charsets.UTF_8)
                        _incomingRawJson.tryEmit(text)
                    }
                }
            } catch (_: Exception) {
                _state.value = TransportState.ERROR
            } finally {
                _state.value = TransportState.DISCONNECTED
            }
        }.start()
    }

    override suspend fun send(data: String): Result<Unit> = runCatching {
        sendBytes(data.toByteArray(Charsets.UTF_8)).getOrThrow()
    }

    override suspend fun sendBytes(data: ByteArray): Result<Unit> = runCatching {
        val out = outputStream ?: error("RFCOMM output stream not connected")
        val frame = encodeFrame(data)
        out.write(frame)
        out.flush()
    }

    override suspend fun disconnect() {
        isRunning = false
        outputStream?.close()
        outputStream = null
        _state.value = TransportState.DISCONNECTED
    }
}
