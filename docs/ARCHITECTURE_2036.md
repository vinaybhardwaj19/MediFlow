# MediFlow 2036 — Next-Generation Telemedicine & E-Pharmacy Ecosystem
## Master Architecture Reference — Phase 1 Deliverable

> **Classification**: Enterprise Architecture Document  
> **Status**: Phase 1 Complete — Foundation & Edge Schemas  
> **Version**: 2036.1.0

---

## Microservice Topology

```
mediflow-2036/
├── infrastructure/                        # IaC & orchestration layer
│   ├── docker-compose.yml                 # Local dev: all services + DBs
│   ├── k8s/                               # Kubernetes manifests (production)
│   │   ├── namespaces.yaml
│   │   ├── ingress-gateway.yaml           # Envoy / Istio service mesh entry
│   │   └── services/
│   └── terraform/                         # Cloud provisioning (AWS/GCP)
│
├── services/
│   │
│   ├── gateway/                           # [MICROSERVICE 1] API Gateway
│   │   ├── main.go                        # Go — sub-millisecond reverse proxy
│   │   ├── middleware/
│   │   │   ├── did_auth.go                # DID/VC token validation (Phase 2)
│   │   │   ├── pqc_decrypt.go             # Post-Quantum Cryptography layer
│   │   │   └── rate_limiter.go            # Token-bucket per DID identity
│   │   └── routes.go
│   │
│   ├── identity/                          # [MICROSERVICE 2] DID & Auth Service
│   │   ├── main.py                        # FastAPI — W3C DID:WEB resolver
│   │   ├── did_resolver.py                # Decentralized Identifier operations
│   │   ├── vc_issuer.py                   # Verifiable Credential issuance
│   │   ├── pqc_keys.py                    # Kyber-768 / Dilithium-3 key ops
│   │   └── schemas.py
│   │
│   ├── triage/                            # [MICROSERVICE 3] Ambient AI Triage
│   │   ├── main.py                        # FastAPI — existing + 2036 uplift
│   │   ├── ambient_agent.py               # IoT stream processor (Phase 3)
│   │   ├── anomaly_engine.py              # LSTM biometric anomaly detection
│   │   ├── schemas.py                     # Extended with IoT telemetry schemas
│   │   └── model/
│   │       ├── triage_model.pkl           # Existing RF/GB ensemble
│   │       └── lstm_anomaly.h5            # [NEW] LSTM for time-series vitals
│   │
│   ├── consultation/                      # [MICROSERVICE 4] WebXR Telepresence
│   │   ├── main.py                        # FastAPI — WebRTC signalling server
│   │   ├── webrtc_signal.py               # SFU session management
│   │   ├── volumetric_codec.py            # Draco3D mesh compression pipeline
│   │   ├── spatial_audio.py               # Ambisonics audio processing
│   │   └── schemas.py
│   │
│   ├── pharmacy/                          # [MICROSERVICE 5] 3D Bio-Pharmacy
│   │   ├── main.py                        # FastAPI — compounding + dispatch
│   │   ├── bioprinter_api.py              # Personalized dosage computation
│   │   ├── drone_router.py                # 3D A* pathfinding engine (Phase 3)
│   │   ├── fleet_manager.py               # Real-time drone state management
│   │   └── schemas.py
│   │
│   ├── records/                           # [MICROSERVICE 6] Health Records
│   │   ├── main.py                        # FastAPI — FHIR R4 compliant
│   │   ├── fhir_mapper.py                 # FHIR resource transformations
│   │   ├── embedding_service.py           # pgvector semantic search
│   │   └── schemas.py
│   │
│   └── notifications/                     # [MICROSERVICE 7] Edge Notifications
│       ├── main.py                        # FastAPI — SSE + WebSocket push
│       ├── edge_broker.py                 # MQTT bridge for IoT wearables
│       └── schemas.py
│
├── database/                              # [PHASE 1 CORE] Schema definitions
│   ├── migrations/
│   │   ├── 001_core_extensions.sql        # pgvector, TimescaleDB, PostGIS
│   │   ├── 002_identity_schema.sql        # DID identity & credentials
│   │   ├── 003_iot_telemetry_schema.sql   # TimescaleDB hypertable
│   │   ├── 004_health_records_schema.sql  # FHIR + vector embeddings
│   │   ├── 005_pharmacy_schema.sql        # 3D bioprinting + drone fleet
│   │   └── 006_consultation_schema.sql    # WebXR session metadata
│   └── seeds/
│       └── demo_2036.sql                  # Exhibition demo data
│
├── client/                                # [PHASE 4] Spatial UI (existing uplift)
│   ├── index.html
│   ├── css/
│   └── js/
│
├── server/                                # [EXISTING] Node.js bridge (retained)
│   └── src/
│
└── ml-engine/                             # [EXISTING] Triage ML (retained + extended)
    ├── main.py
    └── schemas.py
```

---

## Technology Decision Matrix

| Layer | Technology | Rationale |
|---|---|---|
| API Gateway | Go (net/http) | < 1ms latency; zero GC pauses for auth hot-path |
| Microservices | FastAPI (Python 3.12) | Async I/O; Pydantic v2 validation; ML ecosystem |
| Primary DB | PostgreSQL 16 | ACID + extension ecosystem |
| Vector Store | pgvector 0.7 | Semantic EHR search; medical record similarity |
| Time-Series | TimescaleDB 2.x | Continuous IoT telemetry aggregation |
| Geo/3D Routing | PostGIS 3.4 | 3D coordinate routing for drone A* pathfinding |
| PQC Crypto | liboqs (Kyber-768) | NIST-standardized post-quantum KEM |
| DID Standard | W3C DID:WEB | Patient-owned health identity |
| Edge Protocol | MQTT 5.0 | Sub-second IoT wearable data ingestion |
