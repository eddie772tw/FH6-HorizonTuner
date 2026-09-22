package org.horizontuner.companion.core.connection

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.horizontuner.companion.core.transport.ITransport
import org.horizontuner.companion.core.transport.TransportState

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    PAIRED,
    STREAMING,
    RECONNECTING
}

class ConnectionStateMachine(
    private val transport: ITransport,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.IO)
) {
    private val _state = MutableStateFlow(ConnectionState.DISCONNECTED)
    val state: StateFlow<ConnectionState> = _state.asStateFlow()

    private var reconnectJob: Job? = null
    private var currentBackoffMs = 1000L
    private val maxBackoffMs = 16000L

    init {
        scope.launch {
            transport.state.collect { tState ->
                when (tState) {
                    TransportState.STREAMING -> {
                        reconnectJob?.cancel()
                        currentBackoffMs = 1000L
                        _state.value = ConnectionState.STREAMING
                    }
                    TransportState.CONNECTED -> {
                        _state.value = ConnectionState.PAIRED
                    }
                    TransportState.CONNECTING -> {
                        if (_state.value != ConnectionState.RECONNECTING) {
                            _state.value = ConnectionState.CONNECTING
                        }
                    }
                    TransportState.DISCONNECTED, TransportState.ERROR -> {
                        if (_state.value == ConnectionState.STREAMING) {
                            triggerReconnect()
                        } else if (_state.value != ConnectionState.RECONNECTING) {
                            _state.value = ConnectionState.DISCONNECTED
                        }
                    }
                }
            }
        }
    }

    fun connect() {
        reconnectJob?.cancel()
        currentBackoffMs = 1000L
        scope.launch {
            transport.connect()
        }
    }

    fun disconnect() {
        reconnectJob?.cancel()
        _state.value = ConnectionState.DISCONNECTED
        scope.launch {
            transport.disconnect()
        }
    }

    private fun triggerReconnect() {
        _state.value = ConnectionState.RECONNECTING
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(currentBackoffMs)
            currentBackoffMs = (currentBackoffMs * 2).coerceAtMost(maxBackoffMs)
            transport.connect()
        }
    }
}
