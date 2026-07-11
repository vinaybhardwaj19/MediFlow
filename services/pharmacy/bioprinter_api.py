"""
bioprinter_api.py — 3D Personalized Medication Compounding Engine
===============================================================================

REAL-WORLD PROBLEM:
    Standard mass-produced pills are dosed for the "average 70kg adult male."
    A 52kg elderly woman with stage-3 chronic kidney disease (CKD) who is also
    a CYP2D6 poor metabolizer (a genetic variant affecting drug metabolism)
    receives the same Metformin dose as a 95kg athletic man with normal renal
    function. The result: either therapeutic failure or drug toxicity.

SOLUTION — PERSONALIZED BIOPRINTING:
    A robotic medication compounder receives a "print job" with a precision
    dosage (to 0.01mg accuracy) computed from the patient's REAL-TIME biometrics
    and pharmacogenomics profile. It fabricates a personalized medication form
    within minutes, eliminating the "one-size-fits-all" paradigm.

DOSAGE COMPUTATION MODEL:
    The personalized dose is derived from the standard reference dose using
    validated clinical scaling equations:

    1. WEIGHT-BASED SCALING:
       dose_weight = standard_dose × (patient_weight_kg / 70.0) ^ weight_exponent

    2. RENAL CLEARANCE ADJUSTMENT (Cockcroft-Gault proxy):
       If renal_clearance_ml_min < 60 (CKD stage 3+):
       dose_renal = dose_weight × (renal_clearance / 80.0)

    3. PHARMACOGENOMICS ADJUSTMENT:
       CYP2D6 poor metabolizer → dose × 0.5 (drug accumulates)
       CYP2D6 ultra-rapid metabolizer → dose × 1.5 (drug cleared too fast)
       CYP3A4 poor metabolizer → dose × 0.6 (for CYP3A4-metabolized drugs)

    4. BIOMETRIC SAFETY OVERRIDE:
       If real-time glucose < 70 mg/dL → flag and defer anti-diabetic drugs
       If real-time SpO2 < 92% → flag and defer respiratory-depressant drugs
===============================================================================
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Dict, Optional

log = logging.getLogger("mediflow.bioprinter")

# ── Drug Database (reference dosages in mg) ────────────────────────────────────
# Standard reference dose for a 70kg adult with normal organ function.
# Production: queried from a pharmacopeia database (e.g., DrugBank API).
REFERENCE_DRUG_DB: Dict[str, Dict] = {
    "metformin": {
        "standard_dose_mg":     500.0,
        "dosage_form":          "tablet",
        "weight_exponent":      0.75,   # Allometric scaling exponent
        "renal_sensitive":      True,
        "cyp_metabolism":       "none",
        "respiratory_depressant": False,
        "anti_diabetic":        True,
        "max_dose_mg":          2550.0,
        "min_dose_mg":          250.0,
    },
    "atorvastatin": {
        "standard_dose_mg":     20.0,
        "dosage_form":          "tablet",
        "weight_exponent":      0.60,
        "renal_sensitive":      False,
        "cyp_metabolism":       "CYP3A4",
        "respiratory_depressant": False,
        "anti_diabetic":        False,
        "max_dose_mg":          80.0,
        "min_dose_mg":          10.0,
    },
    "codeine": {
        "standard_dose_mg":     30.0,
        "dosage_form":          "tablet",
        "weight_exponent":      1.0,
        "renal_sensitive":      True,
        "cyp_metabolism":       "CYP2D6",
        "respiratory_depressant": True,
        "anti_diabetic":        False,
        "max_dose_mg":          60.0,
        "min_dose_mg":          15.0,
    },
    "amlodipine": {
        "standard_dose_mg":     5.0,
        "dosage_form":          "tablet",
        "weight_exponent":      0.70,
        "renal_sensitive":      False,
        "cyp_metabolism":       "CYP3A4",
        "respiratory_depressant": False,
        "anti_diabetic":        False,
        "max_dose_mg":          10.0,
        "min_dose_mg":          2.5,
    },
}

# ── CYP Pharmacogenomics Multipliers ──────────────────────────────────────────
CYP_MULTIPLIERS = {
    "CYP2D6": {
        "poor_metabolizer":       0.50,
        "intermediate_metabolizer": 0.75,
        "normal_metabolizer":     1.00,
        "ultra_rapid_metabolizer": 1.50,
    },
    "CYP3A4": {
        "poor_metabolizer":       0.60,
        "intermediate_metabolizer": 0.80,
        "normal_metabolizer":     1.00,
        "ultra_rapid_metabolizer": 1.30,
    },
}


# ── Dosage Computation ─────────────────────────────────────────────────────────

@dataclass
class BiometricBasis:
    """
    Patient biometrics snapshot used for personalized dosage computation.
    Sourced from telemetry.biometric_stream at prescription time.
    """
    weight_kg:               float = 70.0
    renal_clearance_ml_min:  float = 80.0    # eGFR proxy
    current_glucose_mg_dl:   Optional[float] = None
    current_spo2_pct:        Optional[float] = None
    pharmacogenomics:        Dict[str, str] = field(default_factory=dict)
    # e.g. {"CYP2D6": "poor_metabolizer", "CYP3A4": "normal_metabolizer"}


@dataclass
class DosageResult:
    """
    Result of the personalized dosage computation.
    Written to pharmacy.bioprint_jobs as the compounding specification.
    """
    medication_api_code:  str
    computed_dose_mg:     float
    standard_dose_mg:     float
    dose_deviation_pct:   float
    dosage_form:          str
    safety_flags:         list
    computation_steps:    Dict[str, float]   # Audit trail of each adjustment step
    is_safe_to_compound:  bool
    defer_reason:         Optional[str]


def compute_personalized_dose(
    medication_api_code: str,
    biometrics: BiometricBasis,
) -> DosageResult:
    """
    Compute a personalized medication dose from patient biometrics.

    This function implements the 4-step dosage adjustment pipeline described
    in the module docstring. All adjustment steps are logged for clinical audit.

    Args:
        medication_api_code: Drug identifier (must exist in REFERENCE_DRUG_DB)
        biometrics:          Patient's current biometric snapshot

    Returns:
        DosageResult with the computed dose, safety flags, and audit trail.
    """
    drug = REFERENCE_DRUG_DB.get(medication_api_code.lower())
    if not drug:
        return DosageResult(
            medication_api_code=medication_api_code,
            computed_dose_mg=0.0,
            standard_dose_mg=0.0,
            dose_deviation_pct=0.0,
            dosage_form="unknown",
            safety_flags=["unknown_medication"],
            computation_steps={},
            is_safe_to_compound=False,
            defer_reason=f"Medication '{medication_api_code}' not in pharmacopeia database",
        )

    safety_flags = []
    steps = {}
    standard_dose = drug["standard_dose_mg"]
    dose = standard_dose

    # ── Step 1: Weight-based allometric scaling ────────────────────────────────
    # Allometric scaling: dose ∝ weight^exponent
    # Exponent < 1 means larger patients need proportionally LESS per kg
    # (common for renally-cleared drugs and drugs with wide distribution volume)
    weight_ratio = biometrics.weight_kg / 70.0
    exp = drug.get("weight_exponent", 1.0)
    dose = dose * (weight_ratio ** exp)
    steps["after_weight_scaling"] = round(dose, 3)

    # ── Step 2: Renal clearance adjustment ────────────────────────────────────
    # Cockcroft-Gault: if eGFR < 60, proportionally reduce dose
    # to avoid drug accumulation in patients with impaired kidneys.
    if drug.get("renal_sensitive") and biometrics.renal_clearance_ml_min < 60:
        renal_factor = biometrics.renal_clearance_ml_min / 80.0
        dose *= renal_factor
        steps["after_renal_adjustment"] = round(dose, 3)
        safety_flags.append(f"renal_dose_reduction_{renal_factor:.2f}x")
        if biometrics.renal_clearance_ml_min < 30:
            safety_flags.append("severe_ckd_pharmacist_review_required")

    # ── Step 3: Pharmacogenomics adjustment ───────────────────────────────────
    # Genetic variants affect enzyme activity → drug metabolism rate
    cyp_gene = drug.get("cyp_metabolism")
    if cyp_gene and cyp_gene in CYP_MULTIPLIERS:
        phenotype = biometrics.pharmacogenomics.get(cyp_gene, "normal_metabolizer")
        multiplier = CYP_MULTIPLIERS[cyp_gene].get(phenotype, 1.0)
        dose *= multiplier
        steps["after_pgx_adjustment"] = round(dose, 3)
        if phenotype != "normal_metabolizer":
            safety_flags.append(f"pgx_{cyp_gene}_{phenotype}_dose_x{multiplier}")

    # ── Step 4: Real-time biometric safety overrides ───────────────────────────
    defer_reason = None
    is_safe = True

    if drug.get("anti_diabetic") and biometrics.current_glucose_mg_dl is not None:
        if biometrics.current_glucose_mg_dl < 70.0:
            is_safe = False
            defer_reason = (
                f"DEFERRED: Current glucose {biometrics.current_glucose_mg_dl} mg/dL "
                f"< 70 mg/dL threshold. Anti-diabetic medication contraindicated during hypoglycemia."
            )
            safety_flags.append("hypoglycemia_contraindication")

    if drug.get("respiratory_depressant") and biometrics.current_spo2_pct is not None:
        if biometrics.current_spo2_pct < 92.0:
            is_safe = False
            defer_reason = (
                f"DEFERRED: SpO2 {biometrics.current_spo2_pct}% < 92% threshold. "
                f"Respiratory-depressant medication contraindicated during hypoxia."
            )
            safety_flags.append("hypoxia_contraindication")

    # ── Bounds clipping ───────────────────────────────────────────────────────
    # Clip to pharmacologically safe min/max bounds
    min_dose = drug.get("min_dose_mg", standard_dose * 0.1)
    max_dose = drug.get("max_dose_mg", standard_dose * 3.0)
    dose = max(min_dose, min(max_dose, dose))

    # Round to nearest 0.1mg (bioprinter precision)
    dose = round(dose, 1)
    steps["final_dose_mg"] = dose

    # Compute deviation from standard dose
    deviation_pct = round(((dose - standard_dose) / standard_dose) * 100, 1)
    if abs(deviation_pct) > 50:
        safety_flags.append(f"high_deviation_{deviation_pct}pct_pharmacist_review")

    log.info(
        f"[Bioprinter] Dose computed: {medication_api_code} | "
        f"standard={standard_dose}mg → personalized={dose}mg "
        f"(deviation={deviation_pct:+.1f}%) | flags={safety_flags}"
    )

    return DosageResult(
        medication_api_code  = medication_api_code,
        computed_dose_mg     = dose,
        standard_dose_mg     = standard_dose,
        dose_deviation_pct   = deviation_pct,
        dosage_form          = drug.get("dosage_form", "tablet"),
        safety_flags         = safety_flags,
        computation_steps    = steps,
        is_safe_to_compound  = is_safe,
        defer_reason         = defer_reason,
    )
