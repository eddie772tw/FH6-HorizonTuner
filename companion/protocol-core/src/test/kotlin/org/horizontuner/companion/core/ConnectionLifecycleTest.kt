package org.horizontuner.companion.core

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.horizontuner.companion.core.connection.ConnectionState
import org.horizontuner.companion.core.connection.ConnectionStateMachine
import org.horizontuner.companion.core.model.ForzaTelemetryPacket
import org.horizontuner.companion.core.transport.ITransport
import org.horizontuner.companion.core.transport.TransportState
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConnectionLifecycleTest {

    private class MockTransport : ITransport {
        val mockState = MutableStateFlow(TransportState.DISCONNECTED)
        override val state: StateFlow<TransportState> = mockState

        override suspend fun connect(): Result<Unit> {
            mockState.value = TransportState.CONNECTING
            mockState.value = TransportState.STREAMING
            return Result.success(Unit)
        }

        override suspend fun send(data: String): Result<Unit> = Result.success(Unit)
        override suspend fun sendBytes(data: ByteArray): Result<Unit> = Result.success(Unit)

        override suspend fun disconnect() {
            mockState.value = TransportState.DISCONNECTED
        }

        override val incomingPackets: Flow<ForzaTelemetryPacket> = MutableSharedFlow()
        override val incomingRawJson: Flow<String> = MutableSharedFlow()
    }

    @Test
    fun testLifecycleTransitions() = runTest {
        val testDispatcher = StandardTestDispatcher(testScheduler)
        val testScope = TestScope(testDispatcher)

        val transport = MockTransport()
        val stateMachine = ConnectionStateMachine(transport, testScope)

        assertEquals(ConnectionState.DISCONNECTED, stateMachine.state.value)

        // Trigger connect
        stateMachine.connect()
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(ConnectionState.STREAMING, stateMachine.state.value)

        // Disconnect
        stateMachine.disconnect()
        testDispatcher.scheduler.advanceUntilIdle()

        assertEquals(ConnectionState.DISCONNECTED, stateMachine.state.value)
    }
}
