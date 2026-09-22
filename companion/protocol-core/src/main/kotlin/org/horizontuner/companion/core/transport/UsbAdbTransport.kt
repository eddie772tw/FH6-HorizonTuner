package org.horizontuner.companion.core.transport

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.horizontuner.companion.core.model.ForzaTelemetryPacket
import java.net.InetSocketAddress
import java.net.Socket

/**
 * Working prototype for USB wired connection using ADB reverse.
 *
 * When USB Debugging is enabled on Android and ADB Reverse forwards port 8001,
 * the companion app connects to 127.0.0.1:8001 with near-zero latency (<1ms).
 */
class UsbAdbTransport(
    private val port: Int = 8001,
    private val sessionToken: String? = null
) : ITransport {

    private val _state = MutableStateFlow(TransportState.DISCONNECTED)
    override val state: StateFlow<TransportState> = _state.asStateFlow()

    private var delegate: WebSocketTransport? = null

    override val incomingPackets: Flow<ForzaTelemetryPacket>
        get() = delegate?.incomingPackets ?: kotlinx.coroutines.flow.emptyFlow()

    override val incomingRawJson: Flow<String>
        get() = delegate?.incomingRawJson ?: kotlinx.coroutines.flow.emptyFlow()

    /**
     * Probes 127.0.0.1:port to check if ADB reverse forwarding is active.
     */
    fun probeLocalhost(): Boolean {
        return try {
            Socket().use { socket ->
                socket.connect(InetSocketAddress("127.0.0.1", port), 500)
                true
            }
        } catch (_: Exception) {
            false
        }
    }

    override suspend fun connect(): Result<Unit> = runCatching {
        _state.value = TransportState.CONNECTING
        if (!probeLocalhost()) {
            _state.value = TransportState.ERROR
            error("ADB reverse port 127.0.0.1:$port is not reachable. Ensure USB Debugging is active.")
        }

        val ws = WebSocketTransport("127.0.0.1", port, sessionToken)
        delegate = ws
        val res = ws.connect()
        if (res.isSuccess) {
            _state.value = TransportState.STREAMING
        } else {
            _state.value = TransportState.ERROR
            res.getOrThrow()
        }
    }

    override suspend fun send(data: String): Result<Unit> {
        return delegate?.send(data) ?: Result.failure(IllegalStateException("Not connected"))
    }

    override suspend fun sendBytes(data: ByteArray): Result<Unit> {
        return delegate?.sendBytes(data) ?: Result.failure(IllegalStateException("Not connected"))
    }

    override suspend fun disconnect() {
        delegate?.disconnect()
        delegate = null
        _state.value = TransportState.DISCONNECTED
    }
}
