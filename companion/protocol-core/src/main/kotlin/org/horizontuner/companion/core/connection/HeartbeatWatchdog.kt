package org.horizontuner.companion.core.connection

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Monitors incoming telemetry packet intervals.
 * If no packet arrives within [timeoutMs], triggers [onTimeout].
 */
class HeartbeatWatchdog(
    private val timeoutMs: Long = 2000L,
    private val checkIntervalMs: Long = 500L,
    private val onTimeout: () -> Unit,
    private val onRecovered: (() -> Unit)? = null,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.Default)
) {
    private var lastPacketTimestamp = 0L
    private var isTimedOut = false
    private var watchdogJob: Job? = null

    fun start() {
        stop()
        lastPacketTimestamp = System.currentTimeMillis()
        isTimedOut = false
        watchdogJob = scope.launch {
            while (isActive) {
                delay(checkIntervalMs)
                val elapsed = System.currentTimeMillis() - lastPacketTimestamp
                if (elapsed > timeoutMs && !isTimedOut) {
                    isTimedOut = true
                    onTimeout.invoke()
                }
            }
        }
    }

    fun feed() {
        lastPacketTimestamp = System.currentTimeMillis()
        if (isTimedOut) {
            isTimedOut = false
            onRecovered?.invoke()
        }
    }

    fun stop() {
        watchdogJob?.cancel()
        watchdogJob = null
    }
}
