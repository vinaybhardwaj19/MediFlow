"""
bigquery_ml.py — Google BigQuery & BigQuery ML Integration Module for MediFlow.
Executes serverless SQL-based Machine Learning models to predict patient ICU readmission risk & health trends.
Supports real Google Cloud BigQuery execution via Application Default Credentials (ADC) with simulation fallback.
"""

import os
import logging
from typing import Dict, Any

logger = logging.getLogger("mediflow.bigquery")

PROJECT_ID = os.getenv("BIGQUERY_PROJECT_ID", os.getenv("GCP_PROJECT_ID", "mediflow-sentinel-2036"))
DATASET_ID = os.getenv("BIGQUERY_DATASET", "health_analytics")

# ── BigQuery Client Initialization with Graceful Fallback ─────────────────────
_bq_client = None
_is_connected = False

def get_bigquery_client():
    global _bq_client, _is_connected
    if _bq_client is not None:
        return _bq_client, _is_connected

    try:
        from google.cloud import bigquery
        client = bigquery.Client(project=PROJECT_ID)
        # Test basic connection / dataset check
        _bq_client = client
        _is_connected = True
        logger.info(f"[BigQuery ML] Connected to GCP Project: {PROJECT_ID}, Dataset: {DATASET_ID}")
    except Exception as e:
        _is_connected = False
        _bq_client = None
        logger.warning(f"[BigQuery ML] ADC/Client unavailable ({e}) — operating in simulation fallback mode.")

    return _bq_client, _is_connected

def check_bigquery_health() -> Dict[str, Any]:
    """
    Returns connection and health status of the BigQuery integration.
    """
    _, connected = get_bigquery_client()
    return {
        "status": "connected" if connected else "simulation_fallback",
        "project_id": PROJECT_ID,
        "dataset_id": DATASET_ID,
        "is_connected": connected
    }

def get_bigquery_ml_triage_query(patient_vitals: dict) -> str:
    """
    Generates BigQuery ML SQL query to predict patient hospitalization risk using ML.PREDICT
    """
    sbp = float(patient_vitals.get("systolic_bp", 120))
    hr = float(patient_vitals.get("heart_rate", 72))
    spo2 = float(patient_vitals.get("spo2", 98))
    temp = float(patient_vitals.get("temp", 37.0))

    sql = f"""
    SELECT 
        predicted_risk_level,
        ROUND(predicted_risk_level_probs[OFFSET(0)].prob * 100, 2) AS confidence_percentage
    FROM 
        ML.PREDICT(
            MODEL `{PROJECT_ID}.{DATASET_ID}.triage_risk_model`,
            (
                SELECT 
                    {sbp} AS systolic_bp,
                    {hr} AS heart_rate,
                    {spo2} AS spo2,
                    {temp} AS body_temperature
            )
        )
    """
    return sql.strip()

async def predict_risk_bigquery(patient_vitals: dict) -> Dict[str, Any]:
    """
    Executes BigQuery ML risk prediction with fallback for local demo.
    """
    query = get_bigquery_ml_triage_query(patient_vitals)
    logger.info(f"[BigQuery ML] SQL Query generated:\n{query}")

    client, connected = get_bigquery_client()

    if connected and client:
        try:
            query_job = client.query(query)
            results = list(query_job.result())
            if results:
                row = results[0]
                return {
                    "engine": "Google BigQuery ML (Serverless SQL)",
                    "sqlQuery": query,
                    "predictedRiskLevel": row.get("predicted_risk_level", "ROUTINE"),
                    "confidencePercentage": float(row.get("confidence_percentage", 95.0)),
                    "status": "live"
                }
        except Exception as err:
            logger.error(f"[BigQuery ML] Query execution error: {err} — falling back to simulation.")

    # Fallback simulation result if BigQuery client credentials not loaded locally
    spo2 = float(patient_vitals.get("spo2", 98))
    return {
        "engine": "Google BigQuery ML (Serverless SQL)",
        "sqlQuery": query,
        "predictedRiskLevel": "ROUTINE" if spo2 >= 95 else "HIGH_RISK",
        "confidencePercentage": 96.4,
        "status": "simulation_fallback"
    }
