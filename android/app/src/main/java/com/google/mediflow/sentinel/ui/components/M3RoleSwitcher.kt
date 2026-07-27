package com.google.mediflow.sentinel.ui.components

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

enum class UserRole(val label: String, val icon: String) {
    PATIENT("Patient", "👤"),
    DOCTOR("Doctor (8K Consult)", "🩺"),
    PHARMACIST("Pharmacist", "💊"),
    RIDER("Delivery Rider", "🏍️"),
    LAB("Lab Tech", "🧪"),
    ADMIN("Admin", "🛡️")
}

@Composable
fun M3RoleSwitcherBar(
    currentRole: UserRole,
    onRoleSelected: (UserRole) -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        tonalElevation = 4.dp,
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp)
                .horizontalScroll(rememberScrollState())
        ) {
            Text(
                text = "🌐 Role:",
                style = MaterialTheme.typography.labelMedium.copy(fontSize = 12.sp),
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(end = 8.dp)
            )

            UserRole.values().forEach { role ->
                val isSelected = role == currentRole
                FilterChip(
                    selected = isSelected,
                    onClick = { onRoleSelected(role) },
                    label = {
                        Text(
                            text = "${role.icon} ${role.label}",
                            style = MaterialTheme.typography.labelSmall
                        )
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MaterialTheme.colorScheme.primary,
                        selectedLabelColor = Color.White
                    ),
                    modifier = Modifier.padding(end = 6.dp)
                )
            }
        }
    }
}
