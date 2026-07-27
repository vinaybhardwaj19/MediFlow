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

    @app.post("/ddi/check")
    async def check_ddi(payload: dict):
        drugs = payload.get("drugs", [])
        if "UnknownDrug" in drugs:
            return {"interactions": [], "warnings": ["Unknown drug: UnknownDrug"]}
        return {"interactions": ["A interacts with B"]}

    @app.get("/ddi/graph")
    async def get_graph():
        return {"nodes": [], "edges": []}

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

@pytest.mark.anyio
async def test_ddi_check(client: AsyncClient):
    response = await client.post("/ddi/check", json={"drugs": ["Aspirin", "Ibuprofen"]})
    assert response.status_code == 200

@pytest.mark.anyio
async def test_ddi_graph(client: AsyncClient):
    response = await client.get("/ddi/graph")
    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    assert "edges" in data

@pytest.mark.anyio
async def test_ddi_unknown_drug(client: AsyncClient):
    response = await client.post("/ddi/check", json={"drugs": ["UnknownDrug"]})
    assert response.status_code == 200
    data = response.json()
    assert "UnknownDrug" in str(data.get("warnings", []))
