"""
schemas.py — Pydantic request/response schemas for the MediFlow Triage ML API.
v2.0.0 — Added XAI (SHAP) response fields + clinical scoring + federated stats.
"""

from __future__ import annotations
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator


# ── Inbound ───────────────────────────────────────────────────────────────────

class SymptomDetails(BaseModel):
    duration   : Optional[str] = None
    severity   : Optional[str] = None   # mild | moderate | severe
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
    respiratoryRate  : Optional[float] = Field(None, ge=4,   le=60)
    avpuScore        : Optional[str]   = None   # Alert | Voice | Pain | Unresponsive


class TriageRequest(BaseModel):
    symptoms      : List[str] = Field(..., min_length=1, max_length=30)
    symptomDetails: Optional[SymptomDetails] = None
    vitalSigns    : Optional[VitalSigns] = None
    patientAge    : Optional[int]   = Field(None, ge=0, le=130)
    patientGender : Optional[str]   = None

    @field_validator('symptoms')
    @classmethod
    def strip_symptoms(cls, v):
        return [s.strip().lower() for s in v if s.strip()]


# ── Outbound ──────────────────────────────────────────────────────────────────

class Differential(BaseModel):
    condition  : str
    probability: float = Field(..., ge=0, le=1)


class SHAPExplanation(BaseModel):
    """
    SHAP (SHapley Additive exPlanations) values for the top prediction.
    Each entry maps a symptom to its Shapley value — the magnitude indicates
    how much that symptom pushed the model towards (positive) or away from
    (negative) the recommended specialty.

    Reference: Lundberg & Lee (2017), NeurIPS — https://arxiv.org/abs/1705.07874
    """
    topFeatures  : List[Dict[str, Any]]   # [{"symptom": str, "shap_value": float, "direction": str}]
    baseValue    : float                   # Expected model output (mean prediction)
    outputValue  : float                   # Actual model output for this prediction
    method       : str = "shap_tree"       # "shap_tree" | "feature_importance_fallback"
    explanation  : str = ""                # Human-readable summary


class ClinicalScores(BaseModel):
    """
    Validated clinical early warning scores computed from vital signs.
    These anchor the AI recommendation to established medical benchmarks.
    """
    mews        : Optional[int]   = None   # Modified Early Warning Score (0-14)
    mewsLevel   : Optional[str]   = None   # "low" | "moderate" | "high" | "critical"
    curb65      : Optional[int]   = None   # Pneumonia severity (0-5)
    curb65Risk  : Optional[str]   = None   # "low" | "moderate" | "severe"
    computed    : bool = False


class TriageResponse(BaseModel):
    recommendedSpecialty : str
    confidence           : float = Field(..., ge=0, le=1)
    urgencyLevel         : str   # routine | urgent | emergency
    differentials        : List[Differential]
    modelVersion         : str
    processingTimeMs     : float
    # XAI fields (v2.0.0)
    explanation          : Optional[SHAPExplanation] = None
    clinicalScores       : Optional[ClinicalScores]  = None
    calibrationNote      : str = "Probability calibrated via isotonic regression (CalibratedClassifierCV)"


class HealthResponse(BaseModel):
    status          : str
    service         : str
    modelLoaded     : bool
    modelVersion    : str
    shapEnabled     : bool = False
    evalMetrics     : Optional[Dict[str, Any]] = None


class ModelMetrics(BaseModel):
    """Full evaluation metrics for the Model Performance Dashboard."""
    specialtyAccuracy : float
    urgencyAccuracy   : float
    brierScore        : float
    cvMeanAccuracy    : float
    cvStdAccuracy     : float
    nTrainingSamples  : int
    nFeatureTokens    : int
    nSpecialtyClasses : int
    modelVersion      : str
    calibrated        : bool = True
    shapEnabled       : bool
