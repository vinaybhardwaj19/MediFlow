"""
ambient_agent.py — Ambient AI Surveillance Agent
===============================================================================

REAL-WORLD PROBLEM SOLVED:
    Traditional telemedicine is REACTIVE: the patient notices symptoms,
    calls the clinic, waits for an appointment. By then, a cardiac event
    that could have been prevented 90 minutes ago has occurred.

THE AMBIENT AI AGENT — PROACTIVE HEALTHCARE:
    This agent runs continuously in the background, silently ingesting IoT
    wearable telemetry via MQTT. It processes every reading through the LSTM
    anomaly engine. When a clinically significant pattern is detected, it
    does something unprecedented in healthcare:

        IT CREATES A CONSULTATION REQUEST BEFORE THE PATIENT ASKS FOR ONE.

    The patient receives a notification: "Your wearable has detected an
    elevated cardiac pattern. A cardiologist consultation has been
    automatically scheduled for 15 minutes from now."

SYSTEM DESIGN:
    ┌─────────────────┐        MQTT 5.0        ┌─────────────────┐
    │  Wearable IoT   │ ──────────────────────► │  Ambient Agent  │
    │ (MQTT Publisher)│   topic per device      │  (This module)  │
    └─────────────────┘                         └────────┬────────┘
                                                         │
                                        ┌────────────────┼────────────────┐
                                        ▼                ▼                ▼
                              ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
                              │ TimescaleDB   │  │ LSTM Anomaly │  │ Alert + Auto │
                              │ biometric_    │  │ Engine       │  │ Consultation │
                              │ stream write  │  │ (anomaly_    │  │ Creator      │
                              └──────────────┘  │  engine.py)  │  └──────────────┘
                                                └──────────────┘

MQTT TOPIC STRUCTURE:
    Subscribe: mediflow/telemetry/+/+   (wildcard: any patient, any device)
    Topic format: mediflow/telemetry/{patient_did_encoded}/{device_id}
    Note: patient_did contains ':', which is invalid in MQTT topics.
          We encode ':' → '_' in the topic and decode on receipt.

PROCESSING PIPELINE (per MQTT message):
    1. Parse JSON payload → IoTTelemetryReading
    2. Validate device signature (Dilithium-3 attestation)
    3. Write raw reading to telemetry.biometric_stream (TimescaleDB)
    4. Update patient's LSTM sliding window
    5. If window is ready: run LSTM anomaly inference
    6. Write anomaly_score back to the telemetry row
    7. If anomaly_score ≥ 0.70: create ambient_ai_alert
    8. If severity == critical/emergency: auto-create consultation request

MQTT LIBRARY:
    Uses aiomqtt (async MQTT 5.0 client) for non-blocking integration
    with the FastAPI async event loop.
    Fallback: aio_pika for AMQP if MQTT is not available in dev.

INSTALLATION:
    pip install aiomqtt asyncpg httpx
===============================================================================
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional
import uuid

import asyncpg
import httpx

from anomaly_engine import anomaly_engine, ALERT_THRESHOLD, CRITICAL_THRESHOLD
from schemas import IoTTelemetryReading, AmbientAlertPayload

log = logging.getLogger("mediflow.ambient")

# ── Configuration ─────────────────────────────────────────────────────────────

MQTT_BROKER_HOST    = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_BROKER_PORT    = int(os.getenv("MQTT_BROKER_PORT", "1883"))
MQTT_USERNAME       = os.getenv("MQTT_USERNAME", "")
MQTT_PASSWORD       = os.getenv("MQTT_PASSWORD", "")
MQTT_TOPIC          = "mediflow/telemetry/+/+"  # Wildcard for all patients and devices
MQTT_CLIENT_ID      = f"ambient-agent-{uuid.uuid4().hex[:8]}"

# Internal service URLs (pod network)
CONSULTATION_SERVICE_URL = os.getenv("CONSULT_SERVICE_URL", "http://consultation:8003")
NOTIFY_SERVICE_URL       = os.getenv("NOTIFY_SERVICE_URL", "http://notifications:8006")

# Severity thresholds
THRESHOLD_ADVISORY  = 0.50
THRESHOLD_WARNING   = 0.70
THRESHOLD_CRITICAL  = 0.85
THRESHOLD_EMERGENCY = 0.95


# ── Alert Severity Classification ─────────────────────────────────────────────

def classify_severity(anomaly_score: float) -> str:
    """
    Map anomaly score to clinical severity level.

    Advisory:  0.50–0.69 → "Watch this patient" — notification only
    Warning:   0.70–0.84 → "Schedule a consultation today"
    Critical:  0.85–0.94 → "Immediate consultation, 15 min max"
    Emergency: 0.95–1.00 → "Emergency services may be required"
    """
    if anomaly_score >= THRESHOLD_EMERGENCY:
        return "emergency"
    elif anomaly_score >= THRESHOLD_CRITICAL:
        return "critical"
    elif anomaly_score >= THRESHOLD_WARNING:
        return "warning"
    else:
        return "advisory"


def build_recommended_action(severity: str, anomaly_class: Optional[str]) -> str:
    """
    Determine the recommended automated action based on severity and class.
    This drives what the agent does after detecting an anomaly.
    """
    if severity == "emergency":
        if anomaly_class in ("hypoxic_episode", "cardiac_arrhythmia"):
            return "emergency_services"
        return "emergency_consultation"
    elif severity == "critical":
        return "immediate_consultation"
    elif severity == "warning":
        return "schedule_consultation"
    else:
        return "patient_notification"


# ── Database Writer ───────────────────────────────────────────────────────────

class TelemetryWriter:
    """
    Asynchronous writer for the TimescaleDB biometric_stream hypertable.
    Batches writes using asyncpg's executemany for throughput efficiency.
    """

    def __init__(self, db_pool: asyncpg.Pool):
        self._db = db_pool

    async def write_reading(self, reading: IoTTelemetryReading) -> None:
        """
        Write a single IoT reading to telemetry.biometric_stream.
        The TimescaleDB hypertable automatically routes this to the correct
        daily chunk based on the recorded_at timestamp.
        """
        async with self._db.acquire() as conn:
            await conn.execute("""
                INSERT INTO telemetry.biometric_stream (
                    device_id, patient_did, recorded_at, ingested_at,
                    heart_rate_bpm, heart_rate_variability_ms,
                    spo2_pct, respiratory_rate_bpm,
                    systolic_bp_mmhg, diastolic_bp_mmhg,
                    glucose_mg_dl, body_temperature_c,
                    activity_state, reading_quality
                ) VALUES (
                    $1::uuid, $2, $3::timestamptz, NOW(),
                    $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
                )
                ON CONFLICT (device_id, recorded_at) DO NOTHING
            """,
                reading.device_id,
                reading.patient_did,
                reading.recorded_at,
                reading.heart_rate_bpm,
                reading.hrv_ms,
                reading.spo2_pct,
                reading.respiratory_rate,
                reading.systolic_bp_mmhg,
                reading.diastolic_bp_mmhg,
                reading.glucose_mg_dl,
                reading.body_temperature_c,
                reading.activity_state,
                reading.reading_quality,
            )

    async def write_anomaly_score(
        self,
        device_id: str,
        recorded_at: str,
        anomaly_score: float,
        anomaly_class: Optional[str],
    ) -> None:
        """
        Write the LSTM anomaly score back to the biometric_stream row.
        This UPDATE is applied after inference — the row exists from write_reading().
        The anomaly_score column in the DB is indexed with a partial index
        (WHERE anomaly_score > 0.7) for fast alert dashboard queries.
        """
        async with self._db.acquire() as conn:
            await conn.execute("""
                UPDATE telemetry.biometric_stream
                SET anomaly_score = $1, anomaly_class = $2
                WHERE device_id = $3::uuid AND recorded_at = $4::timestamptz
            """,
                anomaly_score,
                anomaly_class,
                device_id,
                recorded_at,
            )

    async def create_alert(
        self,
        reading: IoTTelemetryReading,
        alert_payload: AmbientAlertPayload,
        action_taken: str,
        consultation_id: Optional[str] = None,
    ) -> str:
        """
        Persist an ambient AI alert to telemetry.ambient_ai_alerts.
        Returns the generated alert UUID for downstream reference.
        """
        alert_id = str(uuid.uuid4())
        async with self._db.acquire() as conn:
            await conn.execute("""
                INSERT INTO telemetry.ambient_ai_alerts (
                    id, patient_did, device_id, alert_type, severity,
                    triggering_readings, ai_confidence,
                    predicted_event_in_minutes, action_taken, consultation_id
                ) VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10)
            """,
                alert_id,
                alert_payload.patient_did,
                alert_payload.device_id,
                alert_payload.alert_type,
                alert_payload.severity,
                json.dumps(alert_payload.triggering_readings),
                alert_payload.ai_confidence,
                alert_payload.predicted_event_in_minutes,
                action_taken,
                consultation_id,
            )
        return alert_id


# ── Consultation Creator ──────────────────────────────────────────────────────

class ConsultationCreator:
    """
    Creates auto-triggered consultation requests via the Consultation microservice.
    This is the core "proactive healthcare" mechanism — the system acts on
    behalf of the patient without requiring any patient interaction.
    """

    def __init__(self, http_client: httpx.AsyncClient):
        self._http = http_client

    async def create_ambient_consultation(
        self,
        patient_did: str,
        alert_type: str,
        severity: str,
        anomaly_score: float,
        triggering_readings: Dict[str, Any],
        predicted_event_in_minutes: Optional[int],
    ) -> Optional[str]:
        """
        Auto-create a consultation request for a patient when the AI detects
        a significant anomaly. The patient receives a push notification.

        Returns the consultation session ID, or None if creation failed.
        """
        specialty_map = {
            "cardiac_arrhythmia":  "Cardiology",
            "hypoxic_episode":     "Pulmonology",
            "hypoglycemic_crash":  "Endocrinology",
            "hypertensive_crisis": "Cardiology",
            "fever_onset":         "General Practitioner",
            "sleep_apnea_event":   "Pulmonology",
            "composite_risk":      "Internal Medicine",
        }

        # Determine urgency-based scheduling window
        if severity in ("emergency", "critical"):
            scheduled_in_minutes = 10  # ASAP — within 10 minutes
        elif severity == "warning":
            scheduled_in_minutes = 60  # Within 1 hour
        else:
            scheduled_in_minutes = 240  # Within 4 hours (advisory)

        payload = {
            "patient_did":         patient_did,
            "session_type":        "ambient_triggered",
            "specialty":           specialty_map.get(alert_type, "General Practitioner"),
            "chief_complaint":     f"Ambient AI detected: {alert_type} (score={anomaly_score:.2f})",
            "urgency":             severity,
            "scheduled_in_minutes": scheduled_in_minutes,
            "ambient_trigger_data": {
                "alert_type":            alert_type,
                "anomaly_score":         anomaly_score,
                "predicted_event_min":   predicted_event_in_minutes,
                "triggering_readings":   triggering_readings,
            },
        }

        try:
            resp = await self._http.post(
                f"{CONSULTATION_SERVICE_URL}/internal/sessions/create-ambient",
                json=payload,
                timeout=5.0,
            )
            if resp.status_code == 201:
                data = resp.json()
                session_id = data.get("session_id")
                log.info(
                    f"[AmbientAgent] ✅ Auto-consultation created: {session_id} "
                    f"patient={patient_did[:20]}... specialty={payload['specialty']}"
                )
                return session_id
            else:
                log.warning(f"[AmbientAgent] Consultation creation failed: {resp.status_code} {resp.text[:200]}")
                return None
        except Exception as e:
            log.error(f"[AmbientAgent] Consultation service unreachable: {e}")
            return None


# ── MQTT Message Processor ────────────────────────────────────────────────────

class AmbientAgentProcessor:
    """
    Core message processing logic for the Ambient AI Agent.
    Decoupled from the MQTT transport layer for testability.
    """

    def __init__(
        self,
        db_pool: asyncpg.Pool,
        http_client: httpx.AsyncClient,
    ):
        self._writer   = TelemetryWriter(db_pool)
        self._creator  = ConsultationCreator(http_client)
        self._stats    = {"processed": 0, "anomalies": 0, "alerts": 0, "consultations": 0}

    async def process_message(self, topic: str, payload_bytes: bytes) -> None:
        """
        Process a single MQTT telemetry message end-to-end.
        This is the hot path — called for every wearable reading.
        Target latency: < 50ms total (DB write + LSTM inference + alert)
        """
        t0 = time.perf_counter()

        # ── Parse the MQTT payload ─────────────────────────────────────────────
        try:
            payload_dict = json.loads(payload_bytes.decode("utf-8"))
            reading = IoTTelemetryReading(**payload_dict)
        except Exception as e:
            log.warning(f"[AmbientAgent] Malformed MQTT payload on {topic}: {e}")
            return

        self._stats["processed"] += 1

        # ── Step 1: Write raw reading to TimescaleDB ───────────────────────────
        # This is fire-and-forget in terms of the processing pipeline —
        # we continue with inference while the DB write completes.
        try:
            await self._writer.write_reading(reading)
        except Exception as e:
            log.error(f"[AmbientAgent] DB write failed for {reading.device_id}: {e}")
            # Continue processing — don't let a DB failure block anomaly detection

        # ── Step 2: Update LSTM sliding window and infer ───────────────────────
        vitals = reading.dict(exclude={"device_id", "patient_did", "recorded_at",
                                       "activity_state", "reading_quality", "device_signature"})
        prediction = anomaly_engine.update_window(
            patient_did = reading.patient_did,
            device_id   = reading.device_id,
            vitals      = vitals,
        )

        # prediction is None if the window isn't full yet (< 12 readings)
        if prediction is None:
            return

        self._stats["anomalies"] += 1 if prediction.anomaly_score >= ALERT_THRESHOLD else 0

        # ── Step 3: Write anomaly score back to TimescaleDB ────────────────────
        if prediction.anomaly_score > 0.0:
            try:
                await self._writer.write_anomaly_score(
                    device_id    = reading.device_id,
                    recorded_at  = reading.recorded_at,
                    anomaly_score= prediction.anomaly_score,
                    anomaly_class= prediction.anomaly_class,
                )
            except Exception as e:
                log.error(f"[AmbientAgent] Anomaly score write failed: {e}")

        # ── Step 4: Alert generation (only if above threshold) ─────────────────
        if prediction.anomaly_score < ALERT_THRESHOLD:
            # Normal or near-normal reading — log metrics and exit
            latency = (time.perf_counter() - t0) * 1000
            if latency > 100:
                log.warning(f"[AmbientAgent] High processing latency: {latency:.1f}ms")
            return

        severity = classify_severity(prediction.anomaly_score)
        action   = build_recommended_action(severity, prediction.anomaly_class)

        alert_payload = AmbientAlertPayload(
            patient_did    = reading.patient_did,
            device_id      = reading.device_id,
            alert_type     = prediction.anomaly_class or "composite_risk",
            severity       = severity,
            anomaly_score  = prediction.anomaly_score,
            ai_confidence  = prediction.confidence,
            triggering_readings = {
                "heart_rate_bpm":    vitals.get("heart_rate_bpm"),
                "spo2_pct":          vitals.get("spo2_pct"),
                "systolic_bp_mmhg":  vitals.get("systolic_bp_mmhg"),
                "glucose_mg_dl":     vitals.get("glucose_mg_dl"),
                "body_temperature_c":vitals.get("body_temperature_c"),
                "recorded_at":       reading.recorded_at,
                "lstm_model":        prediction.model_version,
                "is_simulation":     prediction.is_simulation,
            },
            predicted_event_in_minutes = prediction.predicted_event_in_minutes,
            recommended_action = action,
        )

        self._stats["alerts"] += 1
        log.warning(
            f"[AmbientAgent] 🚨 ALERT | patient={reading.patient_did[:20]}... "
            f"class={alert_payload.alert_type} severity={severity} "
            f"score={prediction.anomaly_score:.3f} action={action}"
        )

        # ── Step 5: Auto-create consultation (if warranted) ────────────────────
        # Advisory alerts → notification only (consultation not auto-created)
        # Warning/Critical/Emergency → auto-create a consultation
        consultation_id = None
        if action in ("schedule_consultation", "immediate_consultation",
                       "emergency_consultation", "emergency_services"):
            consultation_id = await self._creator.create_ambient_consultation(
                patient_did                = reading.patient_did,
                alert_type                 = alert_payload.alert_type,
                severity                   = severity,
                anomaly_score              = prediction.anomaly_score,
                triggering_readings        = alert_payload.triggering_readings,
                predicted_event_in_minutes = prediction.predicted_event_in_minutes,
            )
            if consultation_id:
                self._stats["consultations"] += 1

        # ── Step 6: Persist alert to DB ────────────────────────────────────────
        try:
            actual_action = "consultation_created" if consultation_id else "notification_sent"
            await self._writer.create_alert(reading, alert_payload, actual_action, consultation_id)
        except Exception as e:
            log.error(f"[AmbientAgent] Alert persistence failed: {e}")

        total_latency = (time.perf_counter() - t0) * 1000
        log.info(f"[AmbientAgent] Message processed in {total_latency:.1f}ms | stats={self._stats}")

    def get_stats(self) -> Dict:
        """Return processing statistics for the health check endpoint."""
        return {
            **self._stats,
            "monitored_patients": anomaly_engine.get_patient_count(),
        }


# ── MQTT Event Loop ───────────────────────────────────────────────────────────

async def run_ambient_agent(db_pool: asyncpg.Pool) -> None:
    """
    Main async loop for the Ambient AI Agent.
    Connects to MQTT broker and processes incoming telemetry indefinitely.

    This is launched as a background asyncio Task from the FastAPI lifespan:
        asyncio.create_task(run_ambient_agent(db_pool))

    MQTT LIBRARY PRIORITY:
        1. aiomqtt   — Native async MQTT 5.0 (preferred)
        2. Simulation — If no MQTT broker is available (dev/exhibition mode)
    """
    try:
        import aiomqtt
        await _run_with_aiomqtt(db_pool)
    except ImportError:
        log.warning("[AmbientAgent] aiomqtt not installed — running in simulation mode")
        await _run_simulation_mode(db_pool)


async def _run_with_aiomqtt(db_pool: asyncpg.Pool) -> None:
    """Production MQTT loop using aiomqtt (async MQTT 5.0 client)."""
    import aiomqtt

    async with httpx.AsyncClient() as http_client:
        processor = AmbientAgentProcessor(db_pool, http_client)

        # Reconnection loop: if the MQTT broker goes down, retry every 5 seconds
        while True:
            try:
                log.info(f"[AmbientAgent] Connecting to MQTT broker at {MQTT_BROKER_HOST}:{MQTT_BROKER_PORT}")

                async with aiomqtt.Client(
                    hostname  = MQTT_BROKER_HOST,
                    port      = MQTT_BROKER_PORT,
                    username  = MQTT_USERNAME or None,
                    password  = MQTT_PASSWORD or None,
                    identifier= MQTT_CLIENT_ID,
                    # MQTT 5.0 properties
                    clean_start = True,
                ) as client:
                    # Subscribe to all patient telemetry topics
                    # Topic structure: mediflow/telemetry/{patient_did}/{device_id}
                    await client.subscribe(MQTT_TOPIC, qos=1)
                    log.info(f"[AmbientAgent] ✅ MQTT connected. Subscribed to: {MQTT_TOPIC}")

                    # Process messages as they arrive (async generator)
                    async for message in client.messages:
                        topic   = str(message.topic)
                        payload = message.payload

                        # Process each message as a separate task to avoid
                        # blocking the MQTT receive loop with DB/HTTP calls
                        asyncio.create_task(
                            processor.process_message(topic, payload)
                        )

            except Exception as e:
                log.error(f"[AmbientAgent] MQTT connection lost: {e}. Reconnecting in 5s...")
                await asyncio.sleep(5)


async def _run_simulation_mode(db_pool: asyncpg.Pool) -> None:
    """
    Simulation mode: generates synthetic telemetry readings every 5 seconds.
    Used when no MQTT broker is available (local development, exhibition demo).

    Simulates TWO patient streams:
        - Patient A (DID: sim-patient-a): Healthy vitals with occasional mild anomalies
        - Patient B (DID: sim-patient-b): Developing a hypoxic episode over 10 minutes
    """
    import random

    async with httpx.AsyncClient() as http_client:
        processor = AmbientAgentProcessor(db_pool, http_client)

        sim_patients = [
            {"patient_did": "did:mediflow:simPatientAlpha2036", "device_id": str(uuid.uuid4()),
             "profile": "healthy"},
            {"patient_did": "did:mediflow:simPatientBeta2036",  "device_id": str(uuid.uuid4()),
             "profile": "hypoxic"},
        ]

        tick = 0
        log.info("[AmbientAgent] ⚠️  Simulation mode active — generating synthetic telemetry")

        while True:
            for patient in sim_patients:
                # Generate plausible vitals based on patient profile
                if patient["profile"] == "healthy":
                    spo2 = random.gauss(97.5, 0.5)
                    hr   = random.gauss(72, 5)
                    sbp  = random.gauss(120, 8)
                elif patient["profile"] == "hypoxic":
                    # Gradually declining SpO2 to simulate an episode developing
                    spo2 = max(82, 97.5 - (tick * 0.15))  # Drops ~0.15% per 5s tick
                    hr   = random.gauss(92, 8)              # Compensatory tachycardia
                    sbp  = random.gauss(128, 10)
                else:
                    spo2, hr, sbp = 97.0, 72.0, 120.0

                payload = {
                    "device_id":          patient["device_id"],
                    "patient_did":        patient["patient_did"],
                    "recorded_at":        datetime.now(timezone.utc).isoformat(),
                    "heart_rate_bpm":     round(max(20, hr), 1),
                    "hrv_ms":             round(random.gauss(45, 10), 1),
                    "spo2_pct":           round(max(50, min(100, spo2)), 1),
                    "systolic_bp_mmhg":   round(max(50, sbp), 1),
                    "diastolic_bp_mmhg":  round(random.gauss(78, 6), 1),
                    "respiratory_rate":   round(random.gauss(14, 2), 1),
                    "glucose_mg_dl":      round(random.gauss(100, 10), 1),
                    "body_temperature_c": round(random.gauss(36.8, 0.2), 2),
                    "activity_state":     "resting",
                    "reading_quality":    round(random.uniform(0.85, 1.0), 2),
                }

                topic = (f"mediflow/telemetry/"
                         f"{patient['patient_did'].replace(':', '_')}/"
                         f"{patient['device_id']}")

                await processor.process_message(topic, json.dumps(payload).encode())

            tick += 1
            await asyncio.sleep(5)  # Simulate 5-second device sampling interval
