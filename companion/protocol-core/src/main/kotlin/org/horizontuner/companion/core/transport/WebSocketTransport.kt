package org.horizontuner.companion.core.transport

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.horizontuner.companion.core.decoder.ForzaPacketDecoder
import org.horizontuner.companion.core.model.ForzaTelemetryPacket
import java.util.concurrent.TimeUnit

class WebSocketTransport(
    private val host: String,
    private val port: Int,
    private val sessionToken: String? = null,
    private val useBinary: Boolean = true,
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS) // Keep alive
        .pingInterval(10, TimeUnit.SECONDS)
        .build()
) : ITransport {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _state = MutableStateFlow(TransportState.DISCONNECTED)
    override val state: StateFlow<TransportState> = _state.asStateFlow()

    private val _incomingPackets = MutableSharedFlow<ForzaTelemetryPacket>(extraBufferCapacity = 64)
    override val incomingPackets: Flow<ForzaTelemetryPacket> = _incomingPackets.asSharedFlow()

    private val _incomingRawJson = MutableSharedFlow<String>(extraBufferCapacity = 64)
    override val incomingRawJson: Flow<String> = _incomingRawJson.asSharedFlow()

    private var webSocket: WebSocket? = null

    override suspend fun connect(): Result<Unit> = runCatching {
        if (_state.value == TransportState.CONNECTING || _state.value == TransportState.CONNECTED || _state.value == TransportState.STREAMING) {
            return@runCatching
        }

        _state.value = TransportState.CONNECTING

        val path = if (useBinary) "/ws/telemetry/binary" else "/ws/telemetry"
        val url = buildString {
            append("ws://").append(host).append(":").append(port).append(path)
            if (!sessionToken.isNullOrEmpty()) {
                append("?token=").append(sessionToken)
            }
        }

        val request = Request.Builder().url(url).build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                _state.value = TransportState.STREAMING
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                scope.launch {
                    _incomingRawJson.emit(text)
                }
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                val data = bytes.toByteArray()
                val packet = ForzaPacketDecoder.decode(data)
                if (packet != null) {
                    scope.launch {
                        _incomingPackets.emit(packet)
                    }
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                _state.value = TransportState.DISCONNECTED
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                _state.value = TransportState.DISCONNECTED
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _state.value = TransportState.ERROR
            }
        })
    }

    override suspend fun send(data: String): Result<Unit> = runCatching {
        val ws = webSocket ?: error("WebSocket is not connected")
        if (!ws.send(data)) {
            error("Failed to enqueue string frame to WebSocket")
        }
    }

    override suspend fun sendBytes(data: ByteArray): Result<Unit> = runCatching {
        val ws = webSocket ?: error("WebSocket is not connected")
        if (!ws.send(ByteString.of(*data))) {
            error("Failed to enqueue byte frame to WebSocket")
        }
    }

    override suspend fun disconnect() {
        webSocket?.close(1000, "Companion client disconnect")
        webSocket = null
        _state.value = TransportState.DISCONNECTED
    }
}
