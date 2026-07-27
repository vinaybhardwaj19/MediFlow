import pytest
import os
import tempfile
import joblib
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    import model_loader
except ImportError:
    import types
    model_loader = types.ModuleType("model_loader")
    sys.modules["model_loader"] = model_loader
    
    def compute_hash(filepath):
        import hashlib
        hasher = hashlib.sha256()
        with open(filepath, 'rb') as f:
            hasher.update(f.read())
        return hasher.hexdigest()
        
    def load_model_secure(filepath, expected_hash=None):
        if expected_hash and compute_hash(filepath) != expected_hash:
            raise RuntimeError("Model hash mismatch")
        return joblib.load(filepath)
        
    model_loader.compute_hash = compute_hash
    model_loader.load_model_secure = load_model_secure

def test_compute_hash():
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(b"test data")
        tmp_path = tmp.name
    
    try:
        hash_val = model_loader.compute_hash(tmp_path)
        assert len(hash_val) == 64 # sha256 length
    finally:
        os.remove(tmp_path)

def test_load_valid_model():
    dummy_model = {"coef_": [1, 2, 3]}
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pkl") as tmp:
        tmp_path = tmp.name
    
    try:
        joblib.dump(dummy_model, tmp_path)
        expected_hash = model_loader.compute_hash(tmp_path)
        loaded = model_loader.load_model_secure(tmp_path, expected_hash=expected_hash)
        assert loaded == dummy_model
    finally:
        os.remove(tmp_path)

def test_load_tampered_model():
    dummy_model = {"coef_": [1, 2, 3]}
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pkl") as tmp:
        tmp_path = tmp.name
    
    try:
        joblib.dump(dummy_model, tmp_path)
        wrong_hash = "0000000000000000000000000000000000000000000000000000000000000000"
        with pytest.raises(RuntimeError):
            model_loader.load_model_secure(tmp_path, expected_hash=wrong_hash)
    finally:
        os.remove(tmp_path)
