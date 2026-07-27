# Changelog — MediFlow Enterprise

All notable changes to this project are documented in this file.

## [2.0.0] — 2026-07-27

### Added

#### AI & Machine Learning
- SHAP TreeExplainer integration for transparent triage predictions
- LSTM Anomaly Engine (568 lines) — 7-class biometric anomaly detection
- Drug-Drug Interaction checking via GraphSAGE GNN (45 drugs, 89 edges)
- Clinical NLP entity extraction (symptoms, diagnoses, medications)
- MEWS + CURB-65 clinical scoring aligned to published benchmarks
- Federated Learning simulation (FedAvg + Laplace differential privacy)
- BigQuery ML integration for ICU readmission risk prediction

#### Security
- Post-Quantum Cryptography (FIPS 203 Kyber-768 + FIPS 204 Dilithium-3)
- AES-256-GCM field-level PHI encryption with Mongoose hooks
- Gitleaks secret scanning in CI pipeline
- MongoDB port removed from host exposure (internal Docker only)
- DPDP Act 2023 compliance — data export and erasure endpoints

#### Architecture
- Go API Gateway for sub-millisecond auth (token-bucket rate limiting)
- Apache Kafka event streaming between microservices
- Docker Compose dev/staging/prod overlay system
- Caddy 2 reverse proxy with automatic TLS

#### Frontend
- Reactive component system with lifecycle hooks and event delegation
- TypeScript interface definitions (models.ts, api.ts) for IDE support
- Reactive state store with observer pattern (store.js)

#### Testing & Performance
- 8 unit test files — encryption, ML predict, anomaly, drone, PQC, Kafka, BigQuery
- k6 performance testing — smoke, load (50 VUs), stress (200 VUs), spike (500 VUs)
- Environment variable validation with JSON Schema

#### Documentation
- Architecture specification with 7 Mermaid diagrams
- OpenAPI 3.0 specs for all 3 services (60+ endpoints)
- Deployment guide with production checklist
- Contributing guide with code standards

#### Monitoring
- Grafana dashboard with 12 panels (request rate, latency, errors, triage, anomalies)
- Prometheus metrics collection from Node.js and ML Engine

### Infrastructure
- CI pipeline: lint, server tests, Python tests, env validation, Docker build, secret scan
- Environment configs for dev/staging/prod with schema validation
- Docker Compose staging overlay with resource limits

## [1.0.0] — 2026-07-01

### Added
- Initial telemedicine platform with appointment booking
- Patient/Doctor/Admin role system
- Razorpay payment integration
- Basic symptom triage
- Pharmacy ordering system
- Real-time chat via Socket.IO
