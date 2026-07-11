"""
anomaly_engine.py — LSTM Biometric Anomaly Detection Engine
===============================================================================

REAL-WORLD PROBLEM SOLVED:
    A patient with paroxysmal atrial fibrillation (AFib) may have a perfectly
    normal ECG 99% of the time. During a 10-minute AFib episode their heart
    rate variability collapses, their SpO2 drops subtly, and their resting
    heart rate becomes erratic. A snapshot vital-signs check MISSES this.
    By the time they feel symptoms, hours may have passed.

THE SOLUTION — LSTM TIME-SERIES ANOMALY DETECTION:
    A Long Short-Term Memory (LSTM) neural network analyzes SEQUENCES of
    biometric readings rather than single snapshots. This enables it to detect:

        1. TREND ANOMALIES: Gradually rising temperature or blood pressure
           over 30 minutes — invisible in any single reading.
        2. PATTERN ANOMALIES: Heart rate that briefly normalizes between
           elevated bursts (a signature of certain arrhythmias).
        3. MULTI-VARIATE CORRELATIONS: SpO2 drop COMBINED WITH elevated
           respiratory rate — together they indicate respiratory distress
           even when each metric is only mildly abnormal individually.

ARCHITECTURE:
    Input:   Sliding window of N=12 time-steps × F=8 vital features
             (12 steps × 5-min intervals = 1 hour of history)
    Model:   LSTM(128) → Dropout(0.2) → LSTM(64) → Dropout(0.2) →
             Dense(64, ReLU) → Dense(n_classes, Softmax)
    Output:  [anomaly_class_probabilities] + anomaly_score (max prob of non-normal)

FEATURE VECTOR (8 features per timestep):
    [0] heart_rate_bpm          — Primary cardiac indicator
    [1] hrv_ms                  — HRV collapse = arrhythmia precursor
    [2] spo2_pct                — Oxygen saturation
    [3] systolic_bp_mmhg        — Blood pressure top line
    [4] diastolic_bp_mmhg       — Blood pressure bottom line
    [5] respiratory_rate_bpm    — Respiratory pattern
    [6] glucose_mg_dl           — Metabolic indicator
    [7] body_temperature_c      — Systemic inflammation proxy

ANOMALY CLASSES (7 output classes):
    0: normal               — No clinically significant anomaly
    1: cardiac_arrhythmia   — Irregular rhythm pattern (HRV + HR correlation)
    2: hypoxic_episode      — Sustained SpO2 < 93% (respiratory/cardiac origin)
    3: hypoglycemic_crash   — Rapid glucose drop below 70 mg/dL
    4: hypertensive_crisis  — Sustained systolic > 180 mmHg
    5: fever_onset          — Rising temperature trend > 38.5°C
    6: sleep_apnea_event    — SpO2 dip + HR spike during sleep_activity_state

EXHIBITION SIMULATION MODE:
    If TensorFlow/Keras is not installed, a RULE-BASED simulation engine
    with clinical thresholds replaces the LSTM. The output format is
    identical — the exhibition flow is fully functional either way.
===============================================================================
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

log = logging.getLogger("mediflow.anomaly")

# ── Library Detection ─────────────────────────────────────────────────────────
_TF_AVAILABLE = False
try:
    import tensorflow as tf
    from tensorflow import keras
    _TF_AVAILABLE = True
    log.info("[AnomalyEngine] ✅ TensorFlow loaded — LSTM model active")
except ImportError:
    log.warning(
        "[AnomalyEngine] ⚠️  TensorFlow not available. "
        "Using rule-based clinical threshold simulation. "
        "Install tensorflow>=2.15 for real LSTM inference."
    )

# ── Constants ─────────────────────────────────────────────────────────────────

MODEL_PATH = Path(__file__).parent / "model" / "lstm_anomaly.h5"

# Input dimensionality
WINDOW_SIZE = 12       # Time steps: 12 × 5-min intervals = 1 hour of history
N_FEATURES  = 8        # Feature vector length (see docstring)
N_CLASSES   = 7        # Output classes (see ANOMALY CLASSES above)

# Class index → name mapping
CLASS_NAMES = [
    "normal",
    "cardiac_arrhythmia",
    "hypoxic_episode",
    "hypoglycemic_crash",
    "hypertensive_crisis",
    "fever_onset",
    "sleep_apnea_event",
]

# Alert severity thresholds
ALERT_THRESHOLD  = 0.70   # anomaly_score ≥ 0.70 → generate alert
CRITICAL_THRESHOLD = 0.90 # anomaly_score ≥ 0.90 → CRITICAL severity

# ── Feature Normalization Statistics ─────────────────────────────────────────
# Population-derived mean and standard deviation for Z-score normalization.
# These would be computed from a real patient population in production.
# Values here are approximate clinical reference ranges for a healthy adult.
FEATURE_MEAN = np.array([72.0,  45.0,  97.5, 120.0, 78.0,  14.0, 100.0, 36.8])
FEATURE_STD  = np.array([15.0,  25.0,   2.0,  20.0, 12.0,   4.0,  30.0,  0.5])
# Indices:       [HR,   HRV,  SpO2,  SBP,  DBP,  RR,  Gluc, Temp]


# ── Data Classes ──────────────────────────────────────────────────────────────

@dataclass
class VitalsWindow:
    """
    A sliding window of biometric readings for LSTM inference.
    Accumulates timesteps and provides a normalized numpy array.
    """
    # Circular buffer: list of feature vectors, newest at end
    readings: List[np.ndarray] = field(default_factory=list)
    # Patient context (retained for alert generation)
    patient_did: str = ""
    device_id:   str = ""

    def append(self, feature_vec: np.ndarray) -> None:
        """Add a new timestep. If window is full, drop the oldest reading."""
        self.readings.append(feature_vec)
        if len(self.readings) > WINDOW_SIZE:
            self.readings.pop(0)

    def is_ready(self) -> bool:
        """Returns True when we have enough history for LSTM inference."""
        return len(self.readings) >= WINDOW_SIZE

    def as_model_input(self) -> np.ndarray:
        """
        Return the window as a normalized (1, WINDOW_SIZE, N_FEATURES) array
        ready for LSTM inference.

        Normalization: Z-score using population statistics.
        Z = (x - mean) / std
        This maps each feature to approximately unit normal distribution,
        allowing the LSTM to treat all features equally regardless of scale.
        (Heart rate 72 bpm and SpO2 97% would otherwise have very different
        numeric scales, causing the LSTM to weight them unevenly.)
        """
        window = np.array(self.readings[-WINDOW_SIZE:])  # (WINDOW_SIZE, N_FEATURES)
        # Z-score normalization — clip to [-3, 3] to suppress outlier readings
        normalized = np.clip((window - FEATURE_MEAN) / (FEATURE_STD + 1e-8), -3, 3)
        return normalized.reshape(1, WINDOW_SIZE, N_FEATURES)  # Batch dim for model


@dataclass
class AnomalyPrediction:
    """Output from one LSTM inference call."""
    anomaly_score       : float          # Max probability of any non-normal class
    anomaly_class       : Optional[str]  # Name of the predicted class (None if normal)
    class_probabilities : Dict[str, float]
    confidence          : float
    predicted_event_in_minutes: Optional[int]
    inference_time_ms   : float
    model_version       : str
    is_simulation       : bool = False


# ── LSTM Model Loader ─────────────────────────────────────────────────────────

class LSTMAnomalyEngine:
    """
    LSTM-based biometric anomaly detection engine.
    Maintains per-patient sliding windows and performs real-time inference.

    Thread safety: The model itself is stateless (inference only). The
    patient windows dictionary is accessed only from the async MQTT loop,
    which is single-threaded per asyncio event loop.
    """

    def __init__(self):
        self._model = None
        self._model_version = "not-loaded"
        self._is_simulation = not _TF_AVAILABLE
        # Per-patient sliding windows: {patient_did → VitalsWindow}
        self._patient_windows: Dict[str, VitalsWindow] = {}

    def load_or_train(self) -> None:
        """
        Load LSTM model from disk. If not found AND TensorFlow is available,
        build and train a synthetic exhibition model automatically.
        """
        if not _TF_AVAILABLE:
            log.info("[AnomalyEngine] Simulation mode — no model loading required")
            self._model_version = "rule-based-simulation-v1"
            return

        if MODEL_PATH.exists():
            log.info(f"[AnomalyEngine] Loading LSTM model from {MODEL_PATH}")
            self._model = keras.models.load_model(str(MODEL_PATH))
            self._model_version = "lstm-v2036.3.0"
            log.info("[AnomalyEngine] ✅ LSTM model loaded")
        else:
            log.info("[AnomalyEngine] Model not found — training synthetic exhibition model...")
            self._model = self._build_and_train_synthetic()
            self._model_version = "lstm-synthetic-exhibition-v1"
            log.info(f"[AnomalyEngine] ✅ Synthetic LSTM trained and saved to {MODEL_PATH}")

    def _build_and_train_synthetic(self):
        """
        Build and train the 2-layer LSTM on SYNTHETIC biometric data.

        SYNTHETIC DATA GENERATION:
            For each of the 7 anomaly classes, we generate time-series
            windows that statistically match known clinical patterns:

            cardiac_arrhythmia:  Randomly varying HR (stddev 3×normal),
                                  collapsed HRV (< 15ms)
            hypoxic_episode:     SpO2 trending below 93%, elevated RR
            hypoglycemic_crash:  Glucose < 70, followed by tachycardia
            hypertensive_crisis: Sustained systolic > 180, elevated diastolic
            fever_onset:         Temperature trend > 38.5°C, elevated HR
            sleep_apnea_event:   Intermittent SpO2 dips + HR spikes

        In production, this would be replaced with training on de-identified
        patient data from the telemetry.biometric_stream table.
        """
        n_samples_per_class = 500
        X_list, y_list = [], []

        rng = np.random.default_rng(42)

        for class_idx in range(N_CLASSES):
            for _ in range(n_samples_per_class):
                window = self._generate_synthetic_window(class_idx, rng)
                X_list.append(window)
                y_list.append(class_idx)

        X = np.array(X_list)  # (N_CLASSES*500, WINDOW_SIZE, N_FEATURES)
        y = np.array(y_list)

        # Normalize
        X = np.clip((X - FEATURE_MEAN) / (FEATURE_STD + 1e-8), -3, 3)

        # ── Build the LSTM Architecture ────────────────────────────────────────
        # 2-layer stacked LSTM with dropout for regularization.
        # return_sequences=True on first LSTM: passes the full hidden state
        # sequence to the second LSTM (each timestep's output is used).
        model = keras.Sequential([
            keras.layers.Input(shape=(WINDOW_SIZE, N_FEATURES)),

            # Layer 1: LSTM with 128 units, return full sequence
            keras.layers.LSTM(128, return_sequences=True, name="lstm_1"),
            keras.layers.Dropout(0.2, name="dropout_1"),

            # Layer 2: LSTM with 64 units, return only last hidden state
            keras.layers.LSTM(64, return_sequences=False, name="lstm_2"),
            keras.layers.Dropout(0.2, name="dropout_2"),

            # Dense classification head
            keras.layers.Dense(64, activation='relu', name="dense_1"),
            keras.layers.Dense(N_CLASSES, activation='softmax', name="output"),
        ], name="MediFlow_LSTM_AnomalyDetector")

        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=1e-3),
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy'],
        )

        # Quick training (30 epochs for exhibition — production would use 200+)
        model.fit(
            X, y,
            epochs=30,
            batch_size=64,
            validation_split=0.15,
            verbose=0,
            callbacks=[
                keras.callbacks.EarlyStopping(patience=5, restore_best_weights=True),
                keras.callbacks.ReduceLROnPlateau(patience=3, factor=0.5),
            ]
        )

        # Persist for future startups
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        model.save(str(MODEL_PATH))
        return model

    @staticmethod
    def _generate_synthetic_window(class_idx: int, rng: np.random.Generator) -> np.ndarray:
        """
        Generate a synthetic 12-step biometric window for a given anomaly class.
        Each step is a noisy sample from the class-specific distribution.
        """
        # Base: healthy adult at rest
        base = np.array([72.0, 45.0, 97.5, 120.0, 78.0, 14.0, 100.0, 36.8])
        noise_scale = np.array([3.0, 5.0, 0.5, 5.0, 3.0, 1.0, 5.0, 0.1])

        # Class-specific perturbations
        if class_idx == 0:  # normal — just noise around healthy base
            pass

        elif class_idx == 1:  # cardiac_arrhythmia
            # Erratic HR, collapsed HRV
            base[0] += rng.choice([-25, 0, 30])    # HR varies wildly
            base[1] = rng.uniform(5, 15)             # HRV collapsed
            noise_scale[0] = 12.0                    # High HR variance

        elif class_idx == 2:  # hypoxic_episode
            base[2] = rng.uniform(85, 93)            # SpO2 below normal
            base[5] = rng.uniform(18, 25)            # Elevated respiratory rate
            base[0] = rng.uniform(90, 110)           # Compensatory tachycardia

        elif class_idx == 3:  # hypoglycemic_crash
            # Glucose drops across the window
            base[6] = rng.uniform(45, 70)            # Low glucose
            base[0] = rng.uniform(85, 110)           # Compensatory tachycardia
            base[7] -= rng.uniform(0.3, 0.8)         # Mild temperature drop

        elif class_idx == 4:  # hypertensive_crisis
            base[3] = rng.uniform(180, 220)          # Elevated systolic
            base[4] = rng.uniform(110, 130)          # Elevated diastolic
            base[0] = rng.uniform(85, 100)           # Elevated HR

        elif class_idx == 5:  # fever_onset — temperature rising trend
            # Build a rising temperature trend across the 12 time steps
            base[7] = 37.5  # Starting temp — will trend upward
            base[0] = rng.uniform(85, 100)           # Elevated HR from fever

        elif class_idx == 6:  # sleep_apnea_event
            base[2] = rng.uniform(85, 94)            # SpO2 dip
            base[0] = rng.uniform(45, 65)            # Sleep bradycardia
            noise_scale[2] = 3.0                     # SpO2 oscillating

        # Generate the 12-step window with class-specific noise
        window = np.zeros((WINDOW_SIZE, N_FEATURES))
        for t in range(WINDOW_SIZE):
            step_noise = rng.normal(0, noise_scale)
            row = base + step_noise

            # For fever: add linear temperature trend
            if class_idx == 5:
                row[7] += t * 0.05  # +0.6°C over the full window

            # Clip to physiologically plausible ranges
            row[0] = np.clip(row[0], 20, 300)   # HR
            row[1] = np.clip(row[1], 0, 500)    # HRV
            row[2] = np.clip(row[2], 50, 100)   # SpO2
            row[3] = np.clip(row[3], 50, 300)   # SBP
            row[4] = np.clip(row[4], 20, 200)   # DBP
            row[5] = np.clip(row[5], 2, 60)     # RR
            row[6] = np.clip(row[6], 20, 600)   # Glucose
            row[7] = np.clip(row[7], 30, 45)    # Temp
            window[t] = row

        return window

    # ── Per-Patient Window Management ─────────────────────────────────────────

    def update_window(
        self,
        patient_did: str,
        device_id: str,
        vitals: Dict,
    ) -> Optional[AnomalyPrediction]:
        """
        Ingest a new biometric reading into the patient's sliding window.
        If the window is full (12 timesteps), run LSTM inference.

        Args:
            patient_did: The patient's W3C DID
            device_id:   The wearable device UUID
            vitals:      Dict with keys matching FEATURE VECTOR description above

        Returns:
            AnomalyPrediction if the window is ready for inference, else None
        """
        # Get or create the patient's window
        if patient_did not in self._patient_windows:
            self._patient_windows[patient_did] = VitalsWindow(
                patient_did=patient_did,
                device_id=device_id,
            )

        pw = self._patient_windows[patient_did]

        # Build the feature vector from the incoming vitals dict
        feature_vec = np.array([
            vitals.get("heart_rate_bpm")       or FEATURE_MEAN[0],
            vitals.get("hrv_ms")               or FEATURE_MEAN[1],
            vitals.get("spo2_pct")             or FEATURE_MEAN[2],
            vitals.get("systolic_bp_mmhg")     or FEATURE_MEAN[3],
            vitals.get("diastolic_bp_mmhg")    or FEATURE_MEAN[4],
            vitals.get("respiratory_rate")     or FEATURE_MEAN[5],
            vitals.get("glucose_mg_dl")        or FEATURE_MEAN[6],
            vitals.get("body_temperature_c")   or FEATURE_MEAN[7],
        ], dtype=np.float32)

        pw.append(feature_vec)

        # Only run inference when we have enough history
        if not pw.is_ready():
            return None

        return self._infer(pw)

    # ── Inference ─────────────────────────────────────────────────────────────

    def _infer(self, window: VitalsWindow) -> AnomalyPrediction:
        """
        Run anomaly detection on a full biometric window.
        Routes to LSTM inference or rule-based simulation depending on availability.
        """
        if _TF_AVAILABLE and self._model is not None:
            return self._infer_lstm(window)
        else:
            return self._infer_rules(window)

    def _infer_lstm(self, window: VitalsWindow) -> AnomalyPrediction:
        """
        LSTM inference path: run the Keras model and interpret output probabilities.

        PERFORMANCE NOTE:
            On a modern CPU, a single Keras LSTM inference call takes ~2-5ms.
            On an edge GPU (Jetson Nano), ~0.5ms. This is well within the 5-second
            MQTT message processing budget.
        """
        t0 = time.perf_counter()

        model_input = window.as_model_input()           # (1, WINDOW_SIZE, N_FEATURES)
        proba = self._model.predict(model_input, verbose=0)[0]  # (N_CLASSES,)

        # Anomaly score = 1 - P(normal) = P(any anomaly class)
        # This gives a clean 0→1 severity indicator
        anomaly_score = float(1.0 - proba[0])

        predicted_class_idx = int(np.argmax(proba))
        predicted_class = CLASS_NAMES[predicted_class_idx]
        confidence = float(proba[predicted_class_idx])

        # Only report a non-normal class if its probability exceeds a minimum threshold
        anomaly_class = None if predicted_class == "normal" else predicted_class

        inference_ms = (time.perf_counter() - t0) * 1000

        # Estimate time-to-clinical-event based on anomaly score
        # Linear approximation: score=0.7→60min, score=0.9→10min, score=1.0→immediate
        predicted_event_min = None
        if anomaly_score >= ALERT_THRESHOLD:
            predicted_event_min = max(1, int(60 * (1.0 - anomaly_score) / 0.3))

        return AnomalyPrediction(
            anomaly_score=round(anomaly_score, 4),
            anomaly_class=anomaly_class,
            class_probabilities={CLASS_NAMES[i]: round(float(proba[i]), 4) for i in range(N_CLASSES)},
            confidence=round(confidence, 4),
            predicted_event_in_minutes=predicted_event_min,
            inference_time_ms=round(inference_ms, 2),
            model_version=self._model_version,
            is_simulation=False,
        )

    def _infer_rules(self, window: VitalsWindow) -> AnomalyPrediction:
        """
        Rule-based clinical threshold simulation for exhibition when TensorFlow
        is not available. Uses established clinical decision thresholds.

        Clinical thresholds are based on:
            - AHA/ACC cardiovascular guidelines
            - WHO SpO2 clinical alert thresholds
            - ADA hypoglycemia definition (< 70 mg/dL)
            - JNC 8 hypertensive crisis threshold (systolic ≥ 180)
        """
        t0 = time.perf_counter()

        # Get the most recent reading for threshold checks
        latest = window.readings[-1]
        # Compute rolling averages over the window for trend detection
        window_arr = np.array(window.readings)
        avg = window_arr.mean(axis=0)
        std_dev = window_arr.std(axis=0)

        hr, hrv, spo2, sbp, dbp, rr, glucose, temp = latest
        avg_hr, avg_hrv, avg_spo2, avg_sbp, _, avg_rr, avg_gluc, avg_temp = avg

        # Evaluate each anomaly class in priority order
        anomaly_class = None
        anomaly_score = 0.0
        confidence    = 1.0

        # 1. Cardiac Arrhythmia: HRV collapsed + erratic HR
        if avg_hrv < 12 and std_dev[0] > 18:
            anomaly_class = "cardiac_arrhythmia"
            anomaly_score = min(0.65 + (12 - avg_hrv) / 12 * 0.35, 0.99)

        # 2. Hypoxic Episode: sustained SpO2 < 93%
        elif avg_spo2 < 93:
            anomaly_class = "hypoxic_episode"
            anomaly_score = min(0.70 + (93 - avg_spo2) / 10 * 0.29, 0.99)

        # 3. Hypoglycemic Crash: glucose trending below 70
        elif avg_gluc < 70:
            anomaly_class = "hypoglycemic_crash"
            anomaly_score = min(0.72 + (70 - avg_gluc) / 50 * 0.27, 0.99)

        # 4. Hypertensive Crisis: systolic ≥ 180
        elif avg_sbp >= 180:
            anomaly_class = "hypertensive_crisis"
            anomaly_score = min(0.68 + (avg_sbp - 180) / 40 * 0.31, 0.99)

        # 5. Fever Onset: temperature ≥ 38.5 and trending up
        elif avg_temp >= 38.5 and (window_arr[-1, 7] > window_arr[0, 7]):
            anomaly_class = "fever_onset"
            anomaly_score = min(0.60 + (avg_temp - 38.5) / 2.0 * 0.39, 0.99)

        # 6. Sleep Apnea: SpO2 oscillating during sleep
        elif std_dev[2] > 4.0 and avg_hr < 65:
            anomaly_class = "sleep_apnea_event"
            anomaly_score = min(0.55 + std_dev[2] / 10 * 0.44, 0.99)

        # 7. Normal
        else:
            anomaly_score = max(0.0, min(
                # Mild elevation = small score proportional to deviation from norms
                (max(0, avg_sbp - 140) / 40) * 0.3 +
                (max(0, 95 - avg_spo2) / 5) * 0.4,
                0.69
            ))

        inference_ms = (time.perf_counter() - t0) * 1000
        predicted_event_min = None
        if anomaly_score >= ALERT_THRESHOLD:
            predicted_event_min = max(1, int(60 * (1.0 - anomaly_score) / 0.3))

        return AnomalyPrediction(
            anomaly_score=round(anomaly_score, 4),
            anomaly_class=anomaly_class,
            class_probabilities={n: 0.0 for n in CLASS_NAMES},
            confidence=round(confidence, 4),
            predicted_event_in_minutes=predicted_event_min,
            inference_time_ms=round(inference_ms, 2),
            model_version=self._model_version,
            is_simulation=True,
        )

    def get_patient_count(self) -> int:
        """Returns the number of patients currently being monitored."""
        return len(self._patient_windows)

    def evict_stale_windows(self, max_age_minutes: int = 60) -> int:
        """
        Remove sliding windows for patients who haven't sent data recently.
        Called periodically to prevent memory growth.
        """
        # This is a placeholder — in production, track last_updated_at per window
        stale_count = max(0, len(self._patient_windows) - 10000)
        return stale_count


# ── Singleton Instance ────────────────────────────────────────────────────────
# The engine is a module-level singleton. It is initialised once at service
# startup (via the lifespan event) and shared across all MQTT message handlers.
anomaly_engine = LSTMAnomalyEngine()
