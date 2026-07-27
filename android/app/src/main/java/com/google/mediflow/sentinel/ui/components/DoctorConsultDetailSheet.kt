package com.google.mediflow.sentinel.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Star
import androidx.compose.material me.filled.Warning
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Triage severity evaluation for patient pre-consultation report.
 */
enum class TriageSeverity {
    ROUTINE,
    MODERATE,
    CRITICAL
}

/**
 * Patient pre-consultation intake report structure.
 */
data class PatientSymptomReport(
    val primarySymptom: String,
    val duration: String,
    val severityScore: Int, // 1 to 10 scale
    val triageSeverity: TriageSeverity,
    val notes: String? = null
)

/**
 * Doctor Profile model with complete scope & pricing details.
 */
data class DoctorProfile(
    val id: String,
    val name: String,
    val specialization: String,
    val rating: Double,
    val reviewCount: Int,
    val consultFee: String = "₹800",
    val durationMinutes: Int = 15,
    val achievements: List<String>,
    val onlineScope: List<String>,
    val inClinicRequired: List<String>
)

/**
 * Doctor Video Consult Scope Card & Pre-Consult Triage Sheet (MediFlow Sentinel M3).
 * Integrates patient pre-consult triage, doctor ratings/credentials,
 * online scope vs offline guardrails, anti-bypass security guarantees,
 * and dynamic safety-first booking actions.
 */
@Composable
fun DoctorConsultDetailSheet(
    doctor: DoctorProfile,
    patientReport: PatientSymptomReport,
    onProceedToVideoConsult: () -> Unit,
    onBookInClinic: () -> Unit,
    onEmergencyCall: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isCritical = patientReport.triageSeverity == TriageSeverity.CRITICAL

    Surface(
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 8.dp,
        modifier = modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Drag handle
            Box(
                modifier = Modifier
                    .width(48.dp)
                    .height(5.dp)
                    .clip(RoundedCornerShape(2.5.dp))
                    .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f))
                    .align(Alignment.CenterHorizontally)
            )

            // ── STEP 1: PATIENT INTAKE REPORT SUMMARY ────────────────────────────
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(
                    containerColor = when (patientReport.triageSeverity) {
                        TriageSeverity.CRITICAL -> MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.7f)
                        TriageSeverity.MODERATE -> MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f)
                        TriageSeverity.ROUTINE -> MaterialTheme.colorScheme.surfaceVariant
                    }
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "📋 Pre-Consult Symptom Report",
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        AssistChip(
                            onClick = { },
                            label = {
                                Text(
                                    text = patientReport.triageSeverity.name,
                                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold)
                                )
                            },
                            colors = AssistChipDefaults.assistChipColors(
                                containerColor = when (patientReport.triageSeverity) {
                                    TriageSeverity.CRITICAL -> MaterialTheme.colorScheme.error
                                    TriageSeverity.MODERATE -> MaterialTheme.colorScheme.tertiary
                                    TriageSeverity.ROUTINE -> MaterialTheme.colorScheme.primary
                                },
                                labelColor = Color.White
                            )
                        )
                    }

                    Text(
                        text = "Symptom: ${patientReport.primarySymptom} • Duration: ${patientReport.duration}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // ── CRITICAL ALERT BANNER (If High Severity) ─────────────────────────
            AnimatedVisibility(visible = isCritical) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = "Alert",
                            tint = Color.White,
                            modifier = Modifier.size(24.dp)
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "🚨 Urgent Clinic Visit Recommended",
                                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                                color = Color.White
                            )
                            Text(
                                text = "Your symptoms require physical examination. Video call is not recommended.",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.9f)
                            )
                        }
                    }
                }
            }

            // ── STEP 2: DOCTOR HEADER & RATING ────────────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = doctor.name,
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "${doctor.specialization} • ${doctor.consultFee} (${doctor.durationMinutes} mins)",
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.primary
                    )
                }

                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.secondaryContainer
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Star,
                            contentDescription = "Rating",
                            tint = Color(0xFFFFB800),
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = "${doctor.rating} (${doctor.reviewCount})",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.onSecondaryContainer
                        )
                    }
                }
            }

            // ── ACHIEVEMENTS ──────────────────────────────────────────────────────
            if (doctor.achievements.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    doctor.achievements.forEach { achievement ->
                        AssistChip(
                            onClick = { },
                            label = { Text(achievement, style = MaterialTheme.typography.labelSmall) }
                        )
                    }
                }
            }

            // ── STEP 3: ONLINE CAPABILITY CARD ────────────────────────────────────
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.4f)
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "💻 What We Can Solve in This Video Call",
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onTertiaryContainer
                    )

                    doctor.onlineScope.forEach { scopeItem ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.tertiary,
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                text = scopeItem,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onTertiaryContainer
                            )
                        }
                    }
                }
            }

            // ── STEP 4: IN-CLINIC LIMITATIONS ──────────────────────────────────────
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f)
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "⚠️ Requires Physical Clinic Visit",
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )

                    doctor.inClinicRequired.forEach { requiredItem ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Info,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                text = requiredItem,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onErrorContainer
                            )
                        }
                    }
                }
            }

            // ── PLATFORM VALUE & SECURITY GUARANTEES (Anti-Bypass Value Lock) ─────
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Lock,
                        contentDescription = "Protection",
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp)
                    )
                    Column {
                        Text(
                            text = "🛡️ MediFlow Platform Guarantee",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = "Includes QR E-Prescription (Insurance Claimable) + Free 3-Day Chat Follow-up.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                        )
                    }
                }
            }

            // ── DYNAMIC SAFETY ACTION BUTTONS ─────────────────────────────────────
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (isCritical) {
                    Button(
                        onClick = onBookInClinic,
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp)
                    ) {
                        Text(
                            text = "🏥 Book Immediate In-Clinic Appointment",
                            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold)
                        )
                    }

                    OutlinedButton(
                        onClick = onEmergencyCall,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(46.dp)
                    ) {
                        Text("🚨 Call Emergency Ambulance (112)", color = MaterialTheme.colorScheme.error)
                    }
                } else {
                    Button(
                        onClick = onProceedToVideoConsult,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp)
                    ) {
                        Text(
                            text = "Proceed to Video Consult (${doctor.consultFee})",
                            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold)
                        )
                    }

                    OutlinedButton(
                        onClick = onBookInClinic,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(46.dp)
                    ) {
                        Text("Book In-Clinic Appointment Instead")
                    }
                }
            }
        }
    }
}

// ── PREVIEWS ───────────────────────────────────────────────────────────────────

@Preview(showBackground = true)
@Composable
fun PreviewDoctorConsultDetailSheetRoutine() {
    val sampleDoctor = DoctorProfile(
        id = "doc-001",
        name = "Dr. Ananya Sharma",
        specialization = "Cardiologist",
        rating = 4.9,
        reviewCount = 342,
        consultFee = "₹800",
        durationMinutes = 15,
        achievements = listOf("15+ Yrs Exp", "Former AIIMS Consultant"),
        onlineScope = listOf("BP Log & Medication Adjustment", "ECG/Lab Report Review", "Post-op Follow-up"),
        inClinicRequired = listOf("Stethoscope Auscultation Exam", "12-Lead ECG / Echo Test", "Chest Pain Emergency")
    )

    val sampleReport = PatientSymptomReport(
        primarySymptom = "BP Report Check & Mild Fatigue",
        duration = "2 days",
        severityScore = 3,
        triageSeverity = TriageSeverity.ROUTINE
    )

    MaterialTheme {
        DoctorConsultDetailSheet(
            doctor = sampleDoctor,
            patientReport = sampleReport,
            onProceedToVideoConsult = {},
            onBookInClinic = {},
            onEmergencyCall = {}
        )
    }
}
