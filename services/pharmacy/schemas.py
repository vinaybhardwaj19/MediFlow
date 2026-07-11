"""
schemas.py — Pydantic v2 Schemas: Pharmacy Service
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class BiometricBasisSchema(BaseModel):
    weight_kg:               float = Field(70.0, ge=1, le=300)
    renal_clearance_ml_min:  float = Field(80.0, ge=5, le=200)
    current_glucose_mg_dl:   Optional[float] = Field(None, ge=20, le=600)
    current_spo2_pct:        Optional[float] = Field(None, ge=50, le=100)
    pharmacogenomics:        Dict[str, str] = {}


class CreateBioprintJobRequest(BaseModel):
    prescription_id:    str
    patient_did:        str
    doctor_did:         str
    medication_api_code: str
    quantity_units:     int = Field(1, ge=1, le=90)
    dosage_form:        Optional[str] = None
    biometrics:         BiometricBasisSchema = BiometricBasisSchema()


class BioprintJobResponse(BaseModel):
    job_id:             str
    printer_id:         Optional[str]
    medication_api_code: str
    computed_dose_mg:   float
    standard_dose_mg:   float
    dose_deviation_pct: float
    dosage_form:        str
    safety_flags:       List[str]
    is_safe_to_compound: bool
    defer_reason:       Optional[str]
    status:             str
    estimated_ready_at: Optional[str]


class DroneRouteRequest(BaseModel):
    bioprint_job_id:  str
    patient_did:      str
    dest_lon:         float = Field(..., ge=-180, le=180)
    dest_lat:         float = Field(..., ge=-90, le=90)
    dest_alt_m:       float = Field(5.0, ge=0, le=50)
    priority:         str   = Field("standard", pattern="^(emergency|urgent|standard)$")


class DroneRouteResponse(BaseModel):
    route_id:          str
    drone_id:          Optional[str]
    status:            str
    waypoint_count:    int
    total_distance_km: float
    max_altitude_m:    float
    nfz_avoided:       int
    estimated_duration_s: Optional[int]
    route_wkt:         Optional[str]


class PharmacyHealthResponse(BaseModel):
    status:           str = "ok"
    service:          str = "mediflow-pharmacy"
    version:          str = "2036.3.0"
    db_connected:     bool
    drone_router:     str = "3D A* (PostGIS + 26-directional)"
    bioprinter_drugs: int = 0
