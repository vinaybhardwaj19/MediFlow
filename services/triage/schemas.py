"""
schemas.py — Pydantic v2 Schemas: Triage Service (2036 Ambient Uplift)
===============================================================================
Extends the original TriageRequest/TriageResponse schemas with IoT telemetry
fields required by the Ambient AI Agent's real-time biometric processing path.
===============================================================================
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


# ── Re-export original schemas (backwards compatibility with existing API) ─────

class SymptomDetails(BaseModel):
    duration   : Optional[str] = None
    severity   : Optional[str] = None
    onset      : Optional[str] = None
    location   : Optional[str] = None
    aggravating: List[str] = []
    relieving  : List[str] = []


class VitalSigns(BaseModel):
    temperature      : Optional[float] = Field(None, ge=30,  le=45)
    heartRate        : Optional[float] = Field(None, ge=20,  le=300)
    systolicBP       : Optional[float] = Field(None, ge=50,  le=300)
    diastolicBP      : Optional[float] = Field(None, ge=20,  le=200)
    oxygenSaturation : Optional[float] = Field(None, ge=0,   le=100)


class TriageRequest(BaseModel):
    symptoms      : List[str] = Field(..., min_length=1, max_length=20)
    symptomDetails: Optional[SymptomDetails] = None
    vitalSigns    : Optional[VitalSigns] = None

    @field_validator('symptoms')
    @classmethod
    def strip_symptoms(cls, v):
        return [s.strip().lower() for s in v if s.strip()]


class Differential(BaseModel):
    condition  : str
    probability: float = Field(..., ge=0, le=1)


class TriageResponse(BaseModel):
    recommendedSpecialty: str
    confidence          : float = Field(..., ge=0, le=1)
    urgencyLevel        : str
    differentials       : List[Differential]
    modelVersion        : str
    processingTimeMs    : float


class HealthResponse(BaseModel):
    status      : str
    service     : str
    modelLoaded : bool
    modelVersion: str


# ── NEW: IoT Biometric Telemetry Schemas (Ambient AI Path) ────────────────────

class IoTTelemetryReading(BaseModel):
    """
    A single biometric reading from a wearable IoT device.
    Published to the MQTT topic: mediflow/telemetry/{patient_did}/{device_id}
    Ingested by the Ambient Agent and written to telemetry.biometric_stream.
    """
    device_id         : str   = Field(..., description="UUID of the wearable device")
    patient_did       : str   = Field(..., description="W3C DID of the patient")
    recorded_at       : str   = Field(..., description="ISO 8601 timestamp (device clock, UTC)")

    # Cardiovascular
    heart_rate_bpm    : Optional[float] = Field(None, ge=20,  le=300)
    hrv_ms            : Optional[float] = Field(None, ge=0,   le=500,
                                                 description="Heart Rate Variability (SDNN, ms)")
    systolic_bp_mmhg  : Optional[float] = Field(None, ge=50,  le=300)
    diastolic_bp_mmhg : Optional[float] = Field(None, ge=20,  le=200)

    # Respiratory & Oxygen
    spo2_pct          : Optional[float] = Field(None, ge=50,  le=100)
    respiratory_rate  : Optional[float] = Field(None, ge=2,   le=60)

    # Metabolic
    glucose_mg_dl     : Optional[float] = Field(None, ge=20,  le=600)
    body_temperature_c: Optional[float] = Field(None, ge=30,  le=45)

    # Context
    activity_state    : Optional[str]   = Field(None, description="resting|walking|exercising|sleeping|unknown")
    reading_quality   : float           = Field(1.0, ge=0, le=1,
                                                description="Signal quality from device firmware")

    # Device cryptographic attestation (Dilithium-3 signature by device DID)
    device_signature  : Optional[str]   = Field(None, description="Base64url Dilithium-3 signature of payload")

    model_config = {"populate_by_name": True}


class AnomalyResult(BaseModel):
    """
    Result from the LSTM anomaly detection model for one telemetry reading.
    Written back to telemetry.biometric_stream and used to trigger alerts.
    """
    anomaly_score    : float  = Field(..., ge=0, le=1,
                                      description="0=normal, 1=critical. Threshold=0.7 triggers alert")
    anomaly_class    : Optional[str] = Field(None, description="Detected anomaly type or None")
    confidence       : float  = Field(..., ge=0, le=1)
    predicted_event_in_minutes: Optional[int] = Field(None, description="Estimated minutes to clinical event")
    model_version    : str


class AmbientAlertPayload(BaseModel):
    """
    Payload published to the alert bus when an anomaly triggers a health alert.
    Downstream: the ambient agent creates a consultation request with this data.
    """
    patient_did      : str
    device_id        : str
    alert_type       : str
    severity         : str   # advisory | warning | critical | emergency
    anomaly_score    : float
    ai_confidence    : float
    triggering_readings: Dict[str, Any]
    predicted_event_in_minutes: Optional[int]
    recommended_action: str  # "schedule_consultation" | "emergency_services"


# ── Streaming / SSE Schemas ───────────────────────────────────────────────────

class PatientMonitoringStatus(BaseModel):
    """
    Real-time monitoring status for the patient dashboard (SSE stream).
    Updated every 5 seconds by the Ambient Agent.
    """
    patient_did      : str
    is_monitored     : bool
    device_count     : int
    latest_vitals    : Optional[Dict[str, Any]]
    current_anomaly_score: float = 0.0
    active_alerts    : int = 0
    last_updated_at  : str
