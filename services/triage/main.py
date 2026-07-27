"""
main.py — MediFlow 2036 Triage Service (FastAPI)
===============================================================================

MICROSERVICE RESPONSIBILITY:
    Combines the existing symptom-based triage ML (existing ml-engine) with
    the new Ambient AI surveillance capabilities:

        1. EXISTING PATH: POST /predict — symptom triage (retained from Phase 1)
        2. NEW PATH: MQTT subscriber (background task) — real-time IoT monitoring
        3. NEW ENDPOINT: GET /api/triage/stream/{did} — SSE stream of patient alerts
        4. NEW ENDPOINT: GET /api/triage/alerts — Historical alert log for a patient
        5. NEW ENDPOINT: GET /api/triage/monitoring/status — Patient monitoring status

STARTUP:
    uvicorn main:app --host 0.0.0.0 --port 8002 --workers 2
===============================================================================
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator, Optional

import asyncpg
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import StreamingResponse
import joblib
import numpy as np

from anomaly_engine import anomaly_engine
from ambient_agent import run_ambient_agent
from schemas import (
    TriageRequest, TriageResponse, HealthResponse, Differential,
    PatientMonitoringStatus,
)

log = logging.getLogger("mediflow.triage-service")
logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s")

# ── Existing model bundle (from ml-engine, retained for symptom triage) ────────
_LEGACY_MODEL_PATH = Path(__file__).parent.parent.parent / "ml-engine" / "triage_model.pkl"
_legacy_bundle: Optional[dict] = None

# ── Globals ────────────────────────────────────────────────────────────────────
_db_pool: Optional[asyncpg.Pool] = None
_agent_task: Optional[asyncio.Task] = None

# Emergency keywords (retained from original ml-engine)
EMERGENCY_KEYWORDS = {
    "chest pain", "difficulty breathing", "stroke", "unconscious",
    "severe bleeding", "heart attack", "seizure", "anaphylaxis",
    "coughing blood", "vomiting blood", "suicidal thoughts",
    "loss of consciousness", "facial drooping", "low blood sugar",
}


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _db_pool, _agent_task, _legacy_bundle

    # ── Load legacy symptom triage model ──────────────────────────────────────
    if _LEGACY_MODEL_PATH.exists():
        _legacy_bundle = joblib.load(str(_LEGACY_MODEL_PATH))
        log.info(f"[Startup] ✅ Legacy triage model loaded: {_legacy_bundle.get('model_version')}")
    else:
        log.warning("[Startup] ⚠️  Legacy triage model not found — symptom triage will use rule-based fallback")

    # ── Load LSTM anomaly model ────────────────────────────────────────────────
    log.info("[Startup] Initialising LSTM anomaly engine...")
    anomaly_engine.load_or_train()
    log.info("[Startup] ✅ LSTM anomaly engine ready")

    # ── Database connection pool ───────────────────────────────────────────────
    db_url = os.getenv("DATABASE_URL",
        "postgresql://mediflow:mediflow@localhost:5432/mediflow_2036")
    try:
        _db_pool = await asyncpg.create_pool(db_url, min_size=3, max_size=10)
        log.info("[Startup] ✅ Database pool established")
    except Exception as e:
        log.warning(f"[Startup] ⚠️  Database unavailable: {e} — running without persistence")
        _db_pool = None

    # ── Start Ambient AI Agent as background task ──────────────────────────────
    # The agent runs an infinite async loop. We run it as a background asyncio task
    # so it doesn't block the FastAPI event loop that serves HTTP requests.
    if _db_pool:
        _agent_task = asyncio.create_task(run_ambient_agent(_db_pool))
        log.info("[Startup] ✅ Ambient AI Agent started (background task)")
    else:
        log.warning("[Startup] ⚠️  Ambient Agent not started (no DB connection)")

    log.info("[Startup] ✅ Triage Service ready on port 8002")

    yield  # ── Service runs here ────────────────────────────────────────────

    # ── Teardown ───────────────────────────────────────────────────────────────
    if _agent_task and not _agent_task.done():
        _agent_task.cancel()
        try:
            await _agent_task
        except asyncio.CancelledError:
            pass
    if _db_pool:
        await _db_pool.close()
    log.info("[Shutdown] Triage Service stopped")


# ── FastAPI App ────────────────────────────────────────────────────────────────

app = FastAPI(
    title       = "MediFlow 2036 Triage Service",
    description = (
        "Intelligent medical triage and ambient IoT surveillance service. "
        "Combines RandomForest symptom classification with LSTM biometric "
        "anomaly detection for proactive, pre-emptive healthcare."
    ),
    version     = "2036.3.0",
    lifespan    = lifespan,
)

app.add_middleware(CORSMiddleware,
    allow_origins=[os.getenv("CORS_ALLOWED_ORIGIN", "http://localhost:5050"), "http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization", "X-MediFlow-Request-ID"],
)
app.add_middleware(GZipMiddleware, minimum_size=500)


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["System"])
def health():
    return HealthResponse(
        status       = "ok",
        service      = "mediflow-triage-2036",
        modelLoaded  = _legacy_bundle is not None,
        modelVersion = _legacy_bundle["model_version"] if _legacy_bundle else "not-loaded",
    )


# ── Existing: Symptom Triage (retained from ml-engine, port-forwarded) ─────────

@app.post("/predict", response_model=TriageResponse, tags=["Symptom Triage"])
async def predict(req: TriageRequest):
    """
    Symptom-based triage — retained from the original ML engine.
    Routes to RandomForest + GradientBoosting ensemble if model is loaded,
    falls back to rule-based classification otherwise.
    """
    t0 = time.perf_counter()
    symptoms = req.symptoms

    # Emergency keyword override
    matched = EMERGENCY_KEYWORDS.intersection(symptoms)
    forced_emergency = bool(matched)
    if req.vitalSigns:
        vs = req.vitalSigns
        if (vs.oxygenSaturation and vs.oxygenSaturation < 92) or \
           (vs.heartRate and vs.heartRate > 150):
            forced_emergency = True

    if _legacy_bundle is None:
        # Rule-based fallback
        specialty = "General Practitioner"
        confidence = 0.5
        differentials = []
        urgency = "emergency" if forced_emergency else "routine"
    else:
        # ML prediction
        bundle = _legacy_bundle
        known = set(bundle["mlb"].classes_)
        filtered = [[s for s in symptoms if s in known]]
        X = bundle["mlb"].transform(filtered)
        is_zero = not X.any()

        if is_zero:
            specialty, confidence, differentials = "General Practitioner", 0.5, []
        else:
            proba = bundle["specialty_clf"].predict_proba(X)[0]
            top_idx = int(np.argmax(proba))
            confidence = float(proba[top_idx])
            specialty = bundle["le_specialty"].inverse_transform([top_idx])[0]
            top3 = np.argsort(proba)[::-1][:3]
            differentials = [
                Differential(
                    condition=bundle["le_specialty"].inverse_transform([i])[0],
                    probability=round(float(proba[i]), 4),
                )
                for i in top3 if float(proba[i]) > 0.01
            ]

        if forced_emergency:
            urgency = "emergency"
        elif is_zero:
            urgency = "routine"
        else:
            u_idx = int(bundle["urgency_clf"].predict(X)[0])
            urgency = bundle["le_urgency"].inverse_transform([u_idx])[0]
            if req.symptomDetails and req.symptomDetails.severity == "severe" and urgency == "routine":
                urgency = "urgent"

    processing_ms = round((time.perf_counter() - t0) * 1000, 2)
    return TriageResponse(
        recommendedSpecialty = specialty,
        confidence           = round(confidence, 4),
        urgencyLevel         = urgency,
        differentials        = differentials,
        modelVersion         = _legacy_bundle["model_version"] if _legacy_bundle else "rule-based",
        processingTimeMs     = processing_ms,
    )


# ── NEW: Real-Time Alert SSE Stream ───────────────────────────────────────────

@app.get("/api/triage/stream/{patient_did_encoded}", tags=["Ambient AI"])
async def stream_alerts(
    patient_did_encoded: str,
    request: Request,
):
    """
    Server-Sent Events (SSE) stream of real-time ambient AI alerts for a patient.
    The frontend connects to this endpoint and receives alerts as they are generated
    by the Ambient Agent without polling.

    SSE Format:
        data: {"alert_type": "cardiac_arrhythmia", "severity": "warning", ...}\\n\\n

    The patient_did is URL-encoded (: → %3A) in the path parameter.
    """
    # Decode the patient DID from the URL path
    patient_did = patient_did_encoded.replace("%3A", ":").replace("_", ":")

    # Security: the gateway injects X-MediFlow-DID after DID auth
    # The stream is only served if the authenticated DID matches or is an admin
    requesting_did = request.headers.get("X-MediFlow-DID", "")
    requesting_role = request.headers.get("X-MediFlow-Role", "")
    if requesting_role != "admin" and requesting_did != patient_did:
        raise HTTPException(403, detail="Cannot subscribe to another patient's stream")

    async def event_generator() -> AsyncGenerator[str, None]:
        """
        Generates SSE events by polling the ambient_ai_alerts table every 5 seconds.
        In a production system with Redis Pub/Sub, this would be push-based (zero polling).
        """
        # Send an initial connection confirmation event
        yield f"event: connected\ndata: {json.dumps({'patient_did': patient_did, 'status': 'monitoring_active'})}\n\n"

        last_alert_ts = time.time()

        while True:
            # Check if the client disconnected
            if await request.is_disconnected():
                break

            # Poll for new alerts in the last 5 seconds
            if _db_pool:
                try:
                    rows = await _db_pool.fetch("""
                        SELECT alert_type, severity, ai_confidence, anomaly_score,
                               predicted_event_in_minutes, action_taken, created_at
                        FROM telemetry.ambient_ai_alerts
                        WHERE patient_did = $1
                          AND created_at > NOW() - INTERVAL '5 seconds'
                        ORDER BY created_at DESC
                        LIMIT 5
                    """, patient_did)

                    for row in rows:
                        event_data = {
                            "alert_type":    row["alert_type"],
                            "severity":      row["severity"],
                            "confidence":    float(row["ai_confidence"]),
                            "anomaly_score": float(row["anomaly_score"]),
                            "predicted_event_min": row["predicted_event_in_minutes"],
                            "action_taken":  row["action_taken"],
                            "timestamp":     row["created_at"].isoformat(),
                        }
                        yield f"event: alert\ndata: {json.dumps(event_data)}\n\n"

                except Exception as e:
                    log.error(f"[SSE] DB query failed: {e}")

            # Send a heartbeat keep-alive every 5 seconds
            yield f"event: heartbeat\ndata: {json.dumps({'ts': time.time()})}\n\n"
            await asyncio.sleep(5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering for SSE
        },
    )


# ── NEW: Historical Alerts Query ───────────────────────────────────────────────

@app.get("/api/triage/alerts", tags=["Ambient AI"])
async def get_alerts(request: Request, limit: int = 20, offset: int = 0):
    """
    Returns historical ambient AI alerts for the authenticated patient.
    The patient DID is extracted from the gateway-injected X-MediFlow-DID header.
    """
    patient_did = request.headers.get("X-MediFlow-DID")
    if not patient_did:
        raise HTTPException(401, detail="Authentication required")

    if not _db_pool:
        return {"alerts": [], "note": "Database not connected"}

    rows = await _db_pool.fetch("""
        SELECT id, alert_type, severity, ai_confidence, anomaly_score,
               predicted_event_in_minutes, action_taken, consultation_id, created_at
        FROM telemetry.ambient_ai_alerts
        WHERE patient_did = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
    """, patient_did, limit, offset)

    return {"alerts": [dict(r) for r in rows], "patient_did": patient_did}


# ── NEW: Monitoring Status ─────────────────────────────────────────────────────

@app.get("/api/triage/monitoring/status", tags=["Ambient AI"])
async def monitoring_status(request: Request):
    """Returns the current ambient monitoring status for the authenticated patient."""
    patient_did = request.headers.get("X-MediFlow-DID")
    if not patient_did:
        raise HTTPException(401, detail="Authentication required")

    return PatientMonitoringStatus(
        patient_did           = patient_did,
        is_monitored          = patient_did in anomaly_engine._patient_windows,
        device_count          = 1 if patient_did in anomaly_engine._patient_windows else 0,
        latest_vitals         = None,
        current_anomaly_score = 0.0,
        active_alerts         = 0,
        last_updated_at       = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )


# ── Dev Entrypoint ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True, log_level="info")
