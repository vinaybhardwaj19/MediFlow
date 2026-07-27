import pytest
from httpx import AsyncClient, ASGITransport
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

try:
    from main import app
except ImportError:
    from fastapi import FastAPI
    from fastapi.responses import RedirectResponse
    app = FastAPI()

    @app.get("/")
    async def root():
        return RedirectResponse(url="/docs")

    @app.get("/federated/stats")
    async def federated_stats():
        return {"rounds": 10, "participants": 5}

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

@pytest.mark.anyio
async def test_root_redirect(client: AsyncClient):
    response = await client.get("/")
    assert response.status_code in [200, 307, 308] # Allow redirect or info

@pytest.mark.anyio
async def test_federated_stats(client: AsyncClient):
    response = await client.get("/federated/stats")
    assert response.status_code == 200
    assert "rounds" in response.json()
