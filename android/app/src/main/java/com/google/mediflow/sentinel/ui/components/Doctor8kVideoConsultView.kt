package com.google.mediflow.sentinel.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun Doctor8kVideoConsultView(
    modifier: Modifier = Modifier
) {
    var selectedQuality by remember { mutableStateOf("8K Ultra-HD") }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // Video Viewport Box with Live Patient Vitals Overlay
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(280.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(Color(0xFF0F172A))
                .border(1.dp, Color(0xFF6366F1), RoundedCornerShape(16.dp))
        ) {
            // Simulated 8K Teleconsultation Stream Placeholder
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("🎥 8K Ultra-HD WebRTC Stream Active", color = Color.White, style = MaterialTheme.typography.titleMedium)
                    Text("60 FPS · HEVC 4320p · Crystal Audio", color = Color(0xFF94A3B8), fontSize = 12.sp)
                }
            }

            // Top-Left Resolution Badge
            Surface(
                color = Color(0xFF10B981),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier
                    .padding(12.dp)
                    .align(Alignment.TopStart)
            ) {
                Text(
                    text = "LIVE $selectedQuality",
                    color = Color.White,
                    fontSize = 10.sp,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }

            // Top-Right Patient Vitals HUD Overlay
            Surface(
                color = Color(0xCC1E293B),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .padding(12.dp)
                    .align(Alignment.TopEnd)
            ) {
                Row(
                    modifier = Modifier.padding(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Column {
                        Text("HEART RATE", color = Color(0xFF94A3B8), fontSize = 8.sp)
                        Text("74 bpm", color = Color(0xFFEF4444), fontSize = 12.sp)
                    }
                    Column {
                        Text("SpO2", color = Color(0xFF94A3B8), fontSize = 8.sp)
                        Text("98%", color = Color(0xFF10B981), fontSize = 12.sp)
                    }
                    Column {
                        Text("TEMP", color = Color(0xFF94A3B8), fontSize = 8.sp)
                        Text("37.0°C", color = Color(0xFFF97316), fontSize = 12.sp)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Embedded Clinical Controls Card (SOAP & E-Prescribing)
        ElevatedCard(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "📋 Doctor Clinical Suite & SOAP Scribe",
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = "Patient presents with mild throat inflammation. Recommended warm saline rinse & Paracetamol 500mg.",
                    onValueChange = {},
                    label = { Text("AI SOAP Note Auto-Fill") },
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = {},
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("📄 Issue Prescription")
                    }
                    OutlinedButton(
                        onClick = {},
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Export FHIR")
                    }
                }
            }
        }
    }
}
