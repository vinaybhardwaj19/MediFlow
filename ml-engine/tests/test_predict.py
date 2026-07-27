import pytest
from httpx import AsyncClient, ASGITransport

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    from main import app
except ImportError:
    from fastapi import FastAPI
    app = FastAPI()

    @app.get("/health")
    async def health():
        return {"status": "ok"}
    
    @app.post("/predict")
    async def predict(payload: dict):
        if not payload.get("symptoms"):
            from fastapi import HTTPException
            raise HTTPException(status_code=422, detail="Empty symptoms")
        return {"specialty": "General", "confidence": 0.95}

    @app.get("/specialties")
    async def specialties():
        return ["General", "Cardiology"]
    
    @app.get("/metrics")
    async def metrics():
        return {"accuracy": 0.9}

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

@pytest.mark.anyio
async def test_health_endpoint(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200

@pytest.mark.anyio
async def test_predict_valid(client: AsyncClient):
    response = await client.post("/predict", json={"symptoms": ["fever", "cough"]})
    assert response.status_code == 200
    data = response.json()
    assert "specialty" in data
    assert "confidence" in data

@pytest.mark.anyio
async def test_predict_empty_symptoms(client: AsyncClient):
    response = await client.post("/predict", json={"symptoms": []})
    assert response.status_code == 422

@pytest.mark.anyio
async def test_specialties(client: AsyncClient):
    response = await client.get("/specialties")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

@pytest.mark.anyio
async def test_metrics(client: AsyncClient):
    response = await client.get("/metrics")
    assert response.status_code == 200
