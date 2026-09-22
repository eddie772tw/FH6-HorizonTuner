package org.horizontuner.companion.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.horizontuner.companion.core.connection.ConnectionState
import org.horizontuner.companion.theme.HalfmoonTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            HalfmoonTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    CompanionAppContent()
                }
            }
        }
    }
}

@Composable
fun CompanionAppContent() {
    var connectionState by remember { mutableStateOf(ConnectionState.DISCONNECTED) }
    var hostIp by remember { mutableStateOf("192.168.1.100") }
    var hostPort by remember { mutableStateOf("8001") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "FH6 HorizonTuner Companion",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.primary
        )

        Spacer(modifier = Modifier.height(16.dp))

        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            ),
            modifier = Modifier.fillMaxWidth(0.9f)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Connection Status: $connectionState",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )

                OutlinedTextField(
                    value = hostIp,
                    onValueChange = { hostIp = it },
                    label = { Text("Host LAN IP") },
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = hostPort,
                    onValueChange = { hostPort = it },
                    label = { Text("Port (Default: 8001)") },
                    modifier = Modifier.fillMaxWidth()
                )

                Button(
                    onClick = {
                        connectionState = if (connectionState == ConnectionState.DISCONNECTED) {
                            ConnectionState.STREAMING
                        } else {
                            ConnectionState.DISCONNECTED
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(if (connectionState == ConnectionState.DISCONNECTED) "Connect" else "Disconnect")
                }
            }
        }
    }
}
