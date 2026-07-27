package com.google.mediflow.sentinel

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.google.mediflow.sentinel.ui.components.Doctor8kVideoConsultView
import com.google.mediflow.sentinel.ui.components.M3RoleSwitcherBar
import com.google.mediflow.sentinel.ui.components.UserRole
import com.google.mediflow.sentinel.ui.theme.MediFlowSentinelTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MediFlowSentinelTheme {
                var activeRole by remember { mutableStateOf(UserRole.DOCTOR) }

                Scaffold(
                    topBar = {
                        Column {
                            CenterAlignedTopAppBar(
                                title = { Text("🏥 MediFlow Sentinel OS") }
                            )
                            M3RoleSwitcherBar(
                                currentRole = activeRole,
                                onRoleSelected = { role -> activeRole = role }
                            )
                        }
                    }
                ) { innerPadding ->
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(innerPadding)
                    ) {
                        when (activeRole) {
                            UserRole.DOCTOR -> Doctor8kVideoConsultView()
                            else -> {
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(24.dp)
                                ) {
                                    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                                        Column(modifier = Modifier.padding(20.dp)) {
                                            Text(
                                                text = "${activeRole.icon} ${activeRole.label} Interface",
                                                style = MaterialTheme.typography.titleLarge
                                            )
                                            Spacer(modifier = Modifier.height(8.dp))
                                            Text(
                                                text = "MediFlow Sentinel Active Workspace — Role: ${activeRole.name}",
                                                style = MaterialTheme.typography.bodyMedium,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
