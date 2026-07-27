"""
test_anomaly_engine.py — Unit Tests for LSTM Biometric Anomaly Engine
"""

import sys
import numpy as np
from pathlib import Path

# Add services/triage to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "services" / "triage"))
import anomaly_engine

def get_mock_reading():
    return np.array([88.0, 45.0, 97.0, 120.0, 80.0, 16.0, 95.0, 37.0])

def test_vitals_window_append_and_ready():
    window = anomaly_engine.VitalsWindow()
    assert not window.is_ready()

    for _ in range(12):
        window.append(get_mock_reading())

    assert window.is_ready()

def test_vitals_window_model_input_shape():
    window = anomaly_engine.VitalsWindow()
    for _ in range(15):  # Append more than window size
        window.append(get_mock_reading())

    model_input = window.as_model_input()
    assert model_input.shape == (1, 12, 8)

def test_lstm_anomaly_engine_initialization():
    engine = anomaly_engine.LSTMAnomalyEngine()
    assert engine is not None
    assert engine._is_simulation is True or engine._is_simulation is False
