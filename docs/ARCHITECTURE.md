# MediFlow Enterprise — System Architecture Specification

> **Version**: 2.0.0 | **Status**: Production-Ready  
> **Last Updated**: July 2026

---

## 1. System Overview

MediFlow Enterprise is an AI-first telemedicine and e-pharmacy platform providing real-time symptom triage with SHAP explainability, post-quantum cryptographic identity verification, 3D autonomous drone delivery routing, and continuous biometric anomaly detection via LSTM neural networks.

```mermaid
flowchart TD
    subgraph Client["🖥️ Browser Client (SPA)"]
        UI["Vanilla JS + Vite"]
        SW["Service Worker (PWA)"]
    end

    subgraph Edge["🌐 Edge / Reverse Proxy"]
        Caddy["Caddy 2 — Auto-TLS\nHTTPS Termination\nStatic Asset Serving"]
    end

    subgraph Gateway["🛡️ Go API Gateway :8080"]
        RateLimit["Token-Bucket Rate Limiter"]
        DIDAuth["DID/VC Auth Verification"]
        PQCLayer["PQC Decrypt Middleware"]
        Proxy["Reverse Proxy Router"]
    end

    subgraph Backend["📦 Node.js API Server :5000"]
        Express["Express.js + Socket.IO"]
        Auth["JWT Auth (Access + Refresh)"]
        RBAC["Role-Based Access Control"]
        Routes["16 REST Route Modules"]
    end

    subgraph ML["🧠 ML Engine :8000"]
        FastAPI["FastAPI + Uvicorn"]
        Triage["Triage Classifier (RF + GB)"]
        SHAP["SHAP Explainability"]
        DDI["Drug-Drug Interaction GNN"]
        NER["Clinical NLP Entity Extraction"]
    end

    subgraph Services["⚙️ Python Microservices"]
        Identity["Identity Service\nFIPS 203/204 PQC\nKyber-768 + Dilithium-3"]
        TriageSvc["Triage Service\nLSTM Anomaly Engine\n7-Class Detection"]
        Pharmacy["Pharmacy Service\n3D A* Drone Router\nNo-Fly Zone Avoidance"]
        Analytics["Analytics Service\nBigQuery ML Integration\nICU Readmission Risk"]
    end

    subgraph Data["💾 Data Layer"]
        Mongo[(MongoDB 7.0\nAES-256-GCM Encrypted)]
        Kafka((Apache Kafka\nEvent Streaming))
    end

    subgraph Monitoring["📊 Observability"]
        Prometheus["Prometheus"]
        Grafana["Grafana Dashboards"]
    end

    Client --> Caddy
    Caddy --> Gateway
    Gateway --> Backend
    Gateway --> Identity
    Backend --> ML
    Backend --> Mongo
    Backend <--> TriageSvc
    TriageSvc --> Kafka
    Pharmacy --> Kafka
    Analytics --> Kafka
    Prometheus --> Grafana
    Backend --> Prometheus
```

---

## 2. Request Flow — Client to Response

Shows how a patient's symptom triage request flows through the entire system.

```mermaid
sequenceDiagram
    participant P as Patient Browser
    participant C as Caddy (TLS)
    participant G as Go Gateway
    participant N as Node.js Server
    participant M as ML Engine
    participant DB as MongoDB

    P->>C: POST /api/v1/triage (HTTPS)
    C->>G: Forward (internal HTTP)
    G->>G: Rate limit check
    G->>G: DID/VC auth verification
    G->>N: Proxy to Node.js
    N->>N: JWT verify + RBAC check
    N->>N: Joi schema validation
    N->>M: POST /predict (symptoms + vitals)
    M->>M: Emergency keyword override
    M->>M: MEWS + CURB-65 scoring
    M->>M: Random Forest specialty prediction
    M->>M: Gradient Boosting urgency prediction
    M->>M: SHAP explanation computation
    M-->>N: TriageResponse (specialty + SHAP + scores)
    N->>DB: Save triage record (encrypted)
    N->>N: Emit Socket.IO event
    N-->>G: JSON response
    G-->>C: Forward response
    C-->>P: HTTPS response
```

---

## 3. Data Flow — LSTM Biometric Anomaly Detection

Shows how continuous vital signs from wearable devices are processed by the LSTM anomaly engine.

```mermaid
flowchart LR
    subgraph IoT["🩺 Wearable Device"]
        Sensor["8-Feature Vital Signs\nHR, HRV, SpO2, SBP,\nDBP, RR, Glucose, Temp"]
    end

    subgraph Triage["⚡ Triage Service"]
        Window["Sliding Window\n12 steps × 8 features\n= 1 hour of history"]
        ZScore["Z-Score Normalization\nClipped to -3, +3 σ"]
        LSTM["LSTM Neural Network\nLSTM 128 → Dropout 0.2\nLSTM 64 → Dropout 0.2\nDense 64 ReLU → Softmax 7"]
        Rules["Rule-Based Fallback\nAHA/ACC/WHO Thresholds"]
    end

    subgraph Output["📋 Anomaly Classification"]
        Normal["✅ Normal"]
        Cardiac["🫀 Cardiac Arrhythmia"]
        Hypoxic["🫁 Hypoxic Episode"]
        Hypo["💉 Hypoglycemic Crash"]
        Hyper["🔴 Hypertensive Crisis"]
        Fever["🌡️ Fever Onset"]
        Apnea["😴 Sleep Apnea Event"]
    end

    Sensor -->|"Every 5 min"| Window
    Window -->|"When 12 steps ready"| ZScore
    ZScore -->|"TensorFlow available"| LSTM
    ZScore -->|"TF unavailable"| Rules
    LSTM --> Output
    Rules --> Output
```

---

## 4. Service Communication Map

```mermaid
flowchart TD
    Client["Browser Client"] -->|"HTTPS :443"| Caddy
    Caddy -->|"HTTP :8080"| Gateway["Go API Gateway"]
    Gateway -->|"HTTP :5000"| NodeJS["Node.js Backend"]
    Gateway -->|"HTTP :8001"| Identity["Identity Service"]
    NodeJS -->|"HTTP :8000"| MLEngine["ML Engine"]
    NodeJS -->|"MongoDB Wire :27017"| MongoDB[(MongoDB)]
    NodeJS -->|"WebSocket"| Client

    TriageSvc["Triage Service"] -->|"Kafka :9092"| Kafka((Kafka))
    PharmacySvc["Pharmacy Service"] -->|"Kafka :9092"| Kafka
    AnalyticsSvc["Analytics Service"] -->|"Kafka :9092"| Kafka
    AnalyticsSvc -->|"gRPC"| BigQuery["Google BigQuery ML"]

    NodeJS -->|"HTTP"| TriageSvc
    NodeJS -->|"HTTP"| PharmacySvc

    Prometheus -->|"HTTP scrape :5000/metrics"| NodeJS
    Prometheus -->|"HTTP scrape :8000/metrics"| MLEngine
    Grafana -->|"PromQL"| Prometheus
```

---

## 5. Database Schema Overview

MongoDB collections and their relationships:

```mermaid
erDiagram
    User ||--o| PatientProfile : "has profile"
    User ||--o| Doctor : "has doctor profile"
    User {
        ObjectId _id
        string firstName
        string lastName
        string email
        string phone
        string role
        string passwordHash
        boolean isVerified
    }

    PatientProfile {
        ObjectId userId FK
        string bloodGroup
        array allergies
        array chronicConditions
        string policyNumber "🔐 AES-256-GCM"
        string groupNumber "🔐 AES-256-GCM"
        string emergencyPhone "🔐 AES-256-GCM"
    }

    Doctor {
        ObjectId userId FK
        string licenseNumber "🔐 AES-256-GCM"
        array specializations
        number consultationFee
        object availability
    }

    User ||--o{ Appointment : "books"
    Doctor ||--o{ Appointment : "attends"
    Appointment {
        ObjectId patientId FK
        ObjectId doctorId FK
        string status
        string notes "🔐 AES-256-GCM"
        string chiefComplaint "🔐 AES-256-GCM"
        object consultationRoom
    }

    Doctor ||--o{ Prescription : "writes"
    Appointment ||--o| Prescription : "generates"
    Prescription {
        ObjectId appointmentId FK
        ObjectId doctorId FK
        ObjectId patientId FK
        string diagnosis "🔐 AES-256-GCM"
        array medications
        string notes "🔐 AES-256-GCM"
    }

    User ||--o{ TriageRecord : "submits"
    TriageRecord {
        ObjectId patientId FK
        array symptoms
        object vitalSigns
        string recommendedSpecialty
        number confidence
        string urgencyLevel
        object shapExplanation
    }

    User ||--o{ PharmacyOrder : "places"
    PharmacyOrder {
        ObjectId patientId FK
        ObjectId prescriptionId FK
        string status
        object deliveryAddress
        object droneRoute
    }
```

---

## 6. Security Architecture

### 6.1 Encryption at Rest
- **Algorithm**: AES-256-GCM with random 96-bit IV per encryption
- **Format**: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`
- **Protected Fields**: Insurance info, license numbers, emergency contacts, clinical notes, diagnoses
- **Key Management**: 32-byte key via `ENCRYPTION_KEY` environment variable
- **Hooks**: Mongoose `pre('save')` encrypts, `post('find')`/`post('findOne')` decrypts automatically

### 6.2 Encryption in Transit
- **TLS**: Caddy provides automatic HTTPS with Let's Encrypt certificates
- **Internal**: Services communicate over Docker internal network (no host exposure in production)

### 6.3 Post-Quantum Cryptography (FIPS 203/204)
```mermaid
flowchart LR
    subgraph KEM["Key Encapsulation (FIPS 203)"]
        Kyber["Kyber-768 ML-KEM\nPK: 1184 bytes\nSK: 2400 bytes\nCT: 1088 bytes\nNIST Level 3"]
    end

    subgraph DSA["Digital Signatures (FIPS 204)"]
        Dilithium["Dilithium-3 ML-DSA\nPK: 1952 bytes\nSK: 4000 bytes\nSig: 3309 bytes\nNIST Level 3"]
    end

    subgraph Fallback["Exhibition Fallback"]
        AES["AES-256-GCM\nfor KEM simulation"]
        Ed25519["Ed25519\nfor signature simulation"]
    end

    KEM -.->|"liboqs unavailable"| Fallback
    DSA -.->|"liboqs unavailable"| Fallback
```

### 6.4 Authentication & Authorization
- **JWT**: Access tokens (15min) + Refresh tokens (7d) with HttpOnly cookies
- **RBAC**: Role-based middleware — `patient`, `doctor`, `pharmacist`, `rider`, `admin`
- **Rate Limiting**: Token-bucket per identity at the Go gateway level
- **DID**: W3C Decentralized Identifier verification via Identity Service (future)

### 6.5 Compliance
- **HIPAA**: PHI field-level encryption, audit logging, access controls
- **India DPDP Act 2023**: Data export (`/data-rights/export`) and erasure (`/data-rights/erase`) endpoints

---

## 7. Deployment Architecture

```mermaid
flowchart TD
    subgraph Host["Docker Host"]
        subgraph Proxy["Reverse Proxy Layer"]
            Caddy["Caddy :80/:443\nAuto-TLS + Static Files"]
        end

        subgraph App["Application Layer"]
            Gateway["Go Gateway :8080"]
            NodeJS["Node.js :5000"]
            ML["ML Engine :8000"]
        end

        subgraph Microservices["Microservice Layer"]
            Identity["Identity :8001"]
            Triage["Triage :8002"]
            Pharmacy["Pharmacy :8004"]
            Analytics["Analytics :8007"]
        end

        subgraph Data["Data Layer (Internal Network Only)"]
            Mongo["MongoDB 7.0 :27017"]
            Zookeeper["Zookeeper :2181"]
            Kafka["Kafka :9092"]
        end

        subgraph Observability["Observability Layer"]
            Prometheus["Prometheus :9090"]
            Grafana["Grafana :3000"]
        end
    end

    Caddy --> Gateway
    Gateway --> NodeJS
    Gateway --> Identity
    NodeJS --> ML
    NodeJS --> Mongo
    Triage --> Kafka
    Pharmacy --> Kafka
    Prometheus --> Grafana
```

### 7.1 Environment Configuration

| Environment | Command | Features |
|-------------|---------|----------|
| **Development** | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` | Hot reload, debug logging, exposed ports |
| **Staging** | `docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --build` | Near-production, test credentials |
| **Production** | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` | Resource limits, no debug, Kafka replication=3, MongoDB internal only |

### 7.2 Resource Limits (Production)

| Service | Memory Limit | CPU Limit |
|---------|-------------|-----------|
| Node.js Server | 512 MB | 1.0 |
| ML Engine | 1 GB | 2.0 |
| MongoDB | 1 GB | — |
| Identity Service | 256 MB | — |
| Triage Service | 512 MB | — |
| Pharmacy Service | 256 MB | — |

---

## 8. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| API Gateway | Go (net/http) | Sub-millisecond auth hot-path, zero GC pauses |
| Backend API | Node.js + Express | Socket.IO real-time, rich npm ecosystem |
| ML Engine | Python + FastAPI | Async I/O, scikit-learn/SHAP/TensorFlow ecosystem |
| Database | MongoDB 7.0 | Flexible schema for healthcare data models |
| Event Bus | Apache Kafka | Durable event streaming between microservices |
| PQC Crypto | liboqs (Kyber-768, Dilithium-3) | NIST-standardized post-quantum algorithms |
| Reverse Proxy | Caddy 2 | Automatic HTTPS, zero-config TLS |
| Monitoring | Prometheus + Grafana | Industry-standard metrics and dashboards |
| Frontend | Vanilla JS + Vite | Framework-free, fast build tooling |

---

*Built for the future of healthcare. Quantum-resistant. AI-powered. Production-ready.*
