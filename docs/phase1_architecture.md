# MediFlow Enterprise — MERN Telemedicine & E-Pharmacy Platform
## Phase 1: Architecture, Directory Structure & Database Schemas

---

## 1. HIGH-LEVEL SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                  │
│  React SPA (Vite) │ WebRTC Video │ JWT Token Store │ Socket.IO Client│
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS / WSS
┌──────────────────────────────▼──────────────────────────────────────┐
│                      API GATEWAY (Nginx)                             │
│        Rate Limiting │ SSL Termination │ Load Balancing              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                   NODE.JS / EXPRESS.JS BACKEND                       │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │
│  │  Auth Module│  │Triage Module│  │ Telecons.   │  │ Pharmacy  │  │
│  │  (JWT/bcrypt│  │ (ML Engine) │  │ (WebRTC Sig)│  │ (Routing) │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘  │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │  Admin API  │  │Socket.IO Hub│  │  File Store  │                 │
│  │             │  │(Real-time)  │  │  (Multer/S3) │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                      DATA LAYER (MongoDB Atlas)                      │
│  Collections: Users │ Doctors │ Appointments │ Prescriptions        │
│               Orders │ Inventory │ Pharmacies │ AuditLogs           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. COMPLETE DIRECTORY STRUCTURE

```
mediflow-enterprise/
│
├── client/                          # React Frontend (Vite)
│   ├── public/
│   │   └── favicon.ico
│   ├── src/
│   │   ├── assets/                  # Static images, icons, fonts
│   │   ├── components/              # Reusable UI components
│   │   │   ├── common/
│   │   │   │   ├── Navbar.jsx
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   ├── Modal.jsx
│   │   │   │   ├── LoadingSpinner.jsx
│   │   │   │   └── ProtectedRoute.jsx
│   │   │   ├── auth/
│   │   │   │   ├── LoginForm.jsx
│   │   │   │   └── RegisterForm.jsx
│   │   │   ├── triage/
│   │   │   │   ├── SymptomChecker.jsx
│   │   │   │   └── TriageResult.jsx
│   │   │   ├── consultation/
│   │   │   │   ├── VideoRoom.jsx
│   │   │   │   ├── DoctorCard.jsx
│   │   │   │   └── AppointmentBooker.jsx
│   │   │   └── pharmacy/
│   │   │       ├── MedicineSearch.jsx
│   │   │       ├── Cart.jsx
│   │   │       └── OrderTracker.jsx
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── TriagePage.jsx
│   │   │   ├── ConsultationPage.jsx
│   │   │   ├── PharmacyPage.jsx
│   │   │   ├── ProfilePage.jsx
│   │   │   └── AdminPage.jsx
│   │   ├── hooks/                   # Custom React hooks
│   │   │   ├── useAuth.js
│   │   │   ├── useWebRTC.js
│   │   │   └── useSocket.js
│   │   ├── context/                 # React Context providers
│   │   │   ├── AuthContext.jsx
│   │   │   └── SocketContext.jsx
│   │   ├── services/                # Axios API service layer
│   │   │   ├── api.js               # Axios base instance
│   │   │   ├── authService.js
│   │   │   ├── triageService.js
│   │   │   ├── consultationService.js
│   │   │   └── pharmacyService.js
│   │   ├── store/                   # Zustand state management
│   │   │   ├── authStore.js
│   │   │   └── cartStore.js
│   │   ├── utils/
│   │   │   ├── validators.js
│   │   │   └── formatters.js
│   │   ├── styles/
│   │   │   ├── globals.css
│   │   │   └── variables.css
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.example
│   ├── vite.config.js
│   └── package.json
│
├── server/                          # Node.js + Express Backend
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js                # MongoDB Mongoose connection
│   │   │   ├── env.js               # Environment variable loader
│   │   │   └── corsOptions.js       # CORS whitelist config
│   │   ├── models/                  # Mongoose ODM Schemas
│   │   │   ├── User.model.js
│   │   │   ├── Doctor.model.js
│   │   │   ├── Appointment.model.js
│   │   │   ├── Prescription.model.js
│   │   │   ├── Medicine.model.js
│   │   │   ├── Order.model.js
│   │   │   ├── Pharmacy.model.js
│   │   │   ├── TriageRecord.model.js
│   │   │   └── AuditLog.model.js
│   │   ├── routes/                  # Express route definitions
│   │   │   ├── auth.routes.js
│   │   │   ├── patient.routes.js
│   │   │   ├── doctor.routes.js
│   │   │   ├── appointment.routes.js
│   │   │   ├── triage.routes.js
│   │   │   ├── consultation.routes.js
│   │   │   ├── pharmacy.routes.js
│   │   │   └── admin.routes.js
│   │   ├── controllers/             # Business logic handlers
│   │   │   ├── auth.controller.js
│   │   │   ├── patient.controller.js
│   │   │   ├── doctor.controller.js
│   │   │   ├── appointment.controller.js
│   │   │   ├── triage.controller.js
│   │   │   ├── consultation.controller.js
│   │   │   ├── pharmacy.controller.js
│   │   │   └── admin.controller.js
│   │   ├── middleware/              # Express middleware
│   │   │   ├── auth.middleware.js   # JWT verification
│   │   │   ├── rbac.middleware.js   # Role-based access control
│   │   │   ├── sanitize.middleware.js # Input sanitization (XSS/NoSQL)
│   │   │   ├── rateLimiter.middleware.js
│   │   │   ├── audit.middleware.js  # Audit trail logger
│   │   │   └── errorHandler.middleware.js
│   │   ├── services/                # Core business services
│   │   │   ├── triage.service.js    # ML symptom classification
│   │   │   ├── routing.service.js   # Dijkstra pharmacy routing
│   │   │   ├── webrtc.service.js    # WebRTC signaling helpers
│   │   │   ├── email.service.js     # Nodemailer notifications
│   │   │   └── encryption.service.js # AES-256 record encryption
│   │   ├── socket/
│   │   │   └── socketHandler.js     # Socket.IO event handlers
│   │   ├── utils/
│   │   │   ├── ApiResponse.js       # Standardized API responses
│   │   │   ├── ApiError.js          # Custom error class
│   │   │   ├── logger.js            # Winston logger
│   │   │   └── validators.js        # Joi/Zod schema validators
│   │   ├── seeds/                   # Demo data seeders
│   │   │   ├── seedDoctors.js
│   │   │   ├── seedMedicines.js
│   │   │   └── seedPharmacies.js
│   │   └── app.js                   # Express app entry
│   ├── server.js                    # HTTP + Socket.IO server bootstrap
│   ├── .env.example
│   └── package.json
│
├── ml-engine/                       # Python ML Microservice (FastAPI)
│   ├── main.py                      # FastAPI entry
│   ├── model/
│   │   ├── triage_classifier.pkl    # Trained sklearn model
│   │   └── train_model.py           # Training script
│   ├── schemas.py                   # Pydantic request/response schemas
│   ├── requirements.txt
│   └── Dockerfile
│
├── nginx/
│   └── nginx.conf                   # Reverse proxy configuration
│
├── docker-compose.yml               # Full stack orchestration
├── .gitignore
└── README.md
```

---

## 3. DATABASE SCHEMAS (MongoDB / Mongoose)

### 3.1 USER DOMAIN

#### User Collection
```
Collection: users
ER Role: Central identity entity. Referenced by Patient, Doctor, Appointment.

Fields:
  _id           : ObjectId (PK, auto-generated)
  firstName     : String, required, trimmed
  lastName      : String, required, trimmed
  email         : String, required, unique, lowercase, indexed
  passwordHash  : String, required (bcrypt, min 12 rounds)
  role          : Enum ["patient", "doctor", "pharmacist", "admin"]
  phone         : String, optional, E.164 format
  dateOfBirth   : Date, optional
  gender        : Enum ["male", "female", "other", "prefer_not_to_say"]
  address       : {
                    street  : String,
                    city    : String,
                    state   : String,
                    zip     : String,
                    country : String
                  }
  profileImage  : String (URL/S3 key)
  isVerified    : Boolean, default false
  isActive      : Boolean, default true
  twoFactorEnabled : Boolean, default false
  twoFactorSecret  : String (encrypted)
  lastLogin     : Date
  refreshTokens : [{ token: String, expiresAt: Date }]  (hashed, max 5)
  createdAt     : Date (auto)
  updatedAt     : Date (auto)

Indexes:
  email (unique)
  role
  isActive

Security Notes:
  - passwordHash NEVER returned in API responses (select: false)
  - refreshTokens hashed before storage
  - twoFactorSecret AES-256 encrypted at rest
```

#### Patient Profile Collection
```
Collection: patient_profiles
ER Role: 1:1 extension of User (role=patient)

Fields:
  _id              : ObjectId
  userId           : ObjectId (FK → users._id, unique, indexed)
  bloodGroup       : Enum ["A+","A-","B+","B-","AB+","AB-","O+","O-"]
  allergies        : [String]
  chronicConditions: [String]
  currentMedications: [{ name: String, dosage: String, frequency: String }]
  emergencyContact : { name: String, relation: String, phone: String }
  insuranceInfo    : {
                       provider   : String,
                       policyNumber: String (encrypted),
                       groupNumber : String (encrypted)
                     }
  medicalHistory   : [ObjectId] → appointments._id
  createdAt        : Date
  updatedAt        : Date
```

---

### 3.2 DOCTOR DOMAIN

#### Doctor Profile Collection
```
Collection: doctor_profiles
ER Role: 1:1 extension of User (role=doctor)

Fields:
  _id                : ObjectId
  userId             : ObjectId (FK → users._id, unique, indexed)
  licenseNumber      : String, required, unique (encrypted)
  specializations    : [String], required
    # e.g. ["Cardiology", "Internal Medicine"]
  subSpecialties     : [String]
  qualifications     : [{ degree: String, institution: String, year: Number }]
  experience         : Number (years)
  consultationFee    : Number (USD cents, integer)
  availableSlots     : [
                         {
                           dayOfWeek : Enum [0-6],
                           startTime : String ("HH:MM"),
                           endTime   : String ("HH:MM"),
                           slotDuration: Number (minutes)
                         }
                       ]
  ratings            : {
                         average : Number (1-5, 1 decimal),
                         count   : Number
                       }
  isAcceptingPatients: Boolean, default true
  hospitalAffiliation: String
  bio                : String (max 1000 chars)
  languages          : [String]
  createdAt          : Date
  updatedAt          : Date

Indexes:
  userId (unique)
  specializations (text index for search)
  ratings.average
```

---

### 3.3 APPOINTMENT & CONSULTATION DOMAIN

#### Appointment Collection
```
Collection: appointments
ER Role: Junction between Patient and Doctor

Fields:
  _id            : ObjectId
  patientId      : ObjectId (FK → users._id, indexed)
  doctorId       : ObjectId (FK → users._id, indexed)
  scheduledAt    : Date, required, indexed
  endAt          : Date, required
  status         : Enum ["pending","confirmed","in_progress","completed","cancelled","no_show"]
  type           : Enum ["video","audio","chat"]
  chiefComplaint : String (max 500 chars)
  triageRecordId : ObjectId (FK → triage_records._id, optional)
  consultationRoom: {
                      roomId     : String (UUID),
                      signalingToken: String (JWT, expires in 2hr)
                    }
  notes          : String (max 2000 chars, encrypted)
  prescriptionId : ObjectId (FK → prescriptions._id, optional)
  cancelledBy    : ObjectId (FK → users._id)
  cancellationReason: String
  paymentStatus  : Enum ["pending","paid","refunded","waived"]
  paymentAmount  : Number (USD cents)
  createdAt      : Date
  updatedAt      : Date

Indexes:
  patientId + scheduledAt (compound)
  doctorId + scheduledAt (compound)
  status
```

#### Prescription Collection
```
Collection: prescriptions
ER Role: Output of Appointment, input to Pharmacy Order

Fields:
  _id             : ObjectId
  appointmentId   : ObjectId (FK → appointments._id)
  patientId       : ObjectId (FK → users._id, indexed)
  doctorId        : ObjectId (FK → users._id)
  medications     : [
                      {
                        medicineName : String,
                        medicineId   : ObjectId (FK → medicines._id, optional),
                        dosage       : String,
                        frequency    : String,
                        duration     : String,
                        instructions : String
                      }
                    ]
  diagnosis       : String (encrypted)
  notes           : String (encrypted)
  digitalSignature: String (doctor's cryptographic signature)
  isVerified      : Boolean, default false
  expiresAt       : Date (30 days from issue)
  status          : Enum ["active","dispensed","expired","revoked"]
  createdAt       : Date
  updatedAt       : Date
```

---

### 3.4 TRIAGE DOMAIN

#### Triage Record Collection
```
Collection: triage_records
ER Role: Output of ML Triage Engine, linked to Appointment

Fields:
  _id               : ObjectId
  patientId         : ObjectId (FK → users._id, indexed)
  sessionId         : String (UUID, anonymous sessions allowed)
  symptoms          : [String], required
  symptomDetails    : {
                        duration    : String,
                        severity    : Enum ["mild","moderate","severe"],
                        onset       : String,
                        location    : String,
                        aggravating : [String],
                        relieving   : [String]
                      }
  vitalSigns        : {
                        temperature : Number,
                        heartRate   : Number,
                        bloodPressure: { systolic: Number, diastolic: Number },
                        oxygenSaturation: Number
                      }
  mlPrediction      : {
                        recommendedSpecialty: String,
                        confidence          : Number (0-1),
                        urgencyLevel        : Enum ["routine","urgent","emergency"],
                        differentials       : [{ condition: String, probability: Number }],
                        modelVersion        : String
                      }
  ruleBasedFlags    : [String]  # Hard-coded emergency flags
  appointmentId     : ObjectId (FK → appointments._id, optional)
  createdAt         : Date

Indexes:
  patientId
  mlPrediction.urgencyLevel
  createdAt
```

---

### 3.5 PHARMACY DOMAIN

#### Medicine Collection
```
Collection: medicines
ER Role: Product catalog for E-Pharmacy

Fields:
  _id              : ObjectId
  name             : String, required, indexed
  genericName      : String
  brand            : String
  category         : Enum ["prescription","otc","controlled"]
  therapeuticClass : String
  description      : String
  dosageForms      : [Enum ["tablet","capsule","syrup","injection","topical","inhaler"]]
  strengthOptions  : [String]  # e.g. ["500mg", "1000mg"]
  requiresPrescription: Boolean, default false
  price            : Number (USD cents, per unit)
  images           : [String] (URLs)
  sideEffects      : [String]
  contraindications: [String]
  isActive         : Boolean, default true
  createdAt        : Date
  updatedAt        : Date

Indexes:
  name (text index)
  genericName (text index)
  category
  requiresPrescription
```

#### Pharmacy Collection
```
Collection: pharmacies
ER Role: Warehouse node in routing graph

Fields:
  _id           : ObjectId
  name          : String, required
  licenseNumber : String, unique
  address       : {
                    street    : String,
                    city      : String,
                    state     : String,
                    zip       : String,
                    country   : String,
                    coordinates: { lat: Number, lng: Number }
                  }
  operatingHours: [{ dayOfWeek: Number, open: String, close: String }]
  contactPhone  : String
  isActive      : Boolean
  deliveryRadius: Number (km)
  inventory     : [
                    {
                      medicineId : ObjectId (FK → medicines._id),
                      stock      : Number,
                      reorderLevel: Number,
                      batchNumber: String,
                      expiresAt  : Date
                    }
                  ]
  routingWeight : Number  # Graph edge weight for Dijkstra
  createdAt     : Date
  updatedAt     : Date

Indexes:
  address.coordinates (2dsphere for geo queries)
  isActive
```

#### Order Collection
```
Collection: orders
ER Role: Customer purchase transaction

Fields:
  _id              : ObjectId
  patientId        : ObjectId (FK → users._id, indexed)
  prescriptionId   : ObjectId (FK → prescriptions._id, optional)
  pharmacyId       : ObjectId (FK → pharmacies._id, indexed)
  items            : [
                       {
                         medicineId   : ObjectId (FK → medicines._id),
                         medicineName : String,
                         quantity     : Number,
                         unitPrice    : Number,
                         subtotal     : Number
                       }
                     ]
  totalAmount      : Number (USD cents)
  deliveryAddress  : {
                       street      : String,
                       city        : String,
                       coordinates : { lat: Number, lng: Number }
                     }
  routingPath      : [ObjectId]  # Ordered array of pharmacy/waypoint IDs
  estimatedDelivery: Date
  trackingStatus   : [
                       {
                         status    : Enum ["placed","confirmed","packed","dispatched","in_transit","delivered","failed"],
                         timestamp : Date,
                         note      : String
                       }
                     ]
  currentStatus    : Enum (same as trackingStatus.status)
  paymentMethod    : Enum ["card","insurance","wallet","cod"]
  paymentStatus    : Enum ["pending","paid","refunded"]
  createdAt        : Date
  updatedAt        : Date

Indexes:
  patientId + createdAt
  pharmacyId
  currentStatus
```

---

### 3.6 AUDIT & COMPLIANCE DOMAIN

#### Audit Log Collection
```
Collection: audit_logs
ER Role: Immutable compliance trail (append-only)

Fields:
  _id        : ObjectId
  userId     : ObjectId (FK → users._id, indexed)
  action     : String (e.g. "LOGIN", "VIEW_PRESCRIPTION", "PLACE_ORDER")
  resource   : String (collection name)
  resourceId : ObjectId
  ipAddress  : String
  userAgent  : String
  method     : Enum ["GET","POST","PUT","PATCH","DELETE"]
  endpoint   : String
  statusCode : Number
  changes    : {
                 before : Mixed (sanitized, no PHI),
                 after  : Mixed
               }
  timestamp  : Date, indexed

Notes:
  - TTL index: auto-delete after 7 years (HIPAA compliance)
  - No UPDATE/DELETE operations permitted on this collection
  - Sensitive fields (passwords, tokens) are never logged
```

---

## 4. ENTITY-RELATIONSHIP SUMMARY

```
users (1) ──────────── (1) patient_profiles
users (1) ──────────── (1) doctor_profiles
users (1) ──────── (Many) appointments  [as patient]
users (1) ──────── (Many) appointments  [as doctor]
appointments (1) ── (1)   prescriptions
appointments (1) ── (1)   triage_records
prescriptions (1) ─ (Many) orders
medicines (Many) ── (Many) pharmacies   [via inventory embedded]
medicines (Many) ── (Many) orders       [via items embedded]
pharmacies (1) ──── (Many) orders
users (1) ──────── (Many) orders        [as patient]
users (1) ──────── (Many) audit_logs
```

---

## 5. SECURITY ARCHITECTURE OVERVIEW

| Layer              | Mechanism                                              |
|--------------------|--------------------------------------------------------|
| Authentication     | JWT Access Token (15min) + Refresh Token (7d, httpOnly)|
| Authorization      | RBAC Middleware (patient/doctor/pharmacist/admin)      |
| Transport          | TLS 1.3 enforced via Nginx                            |
| Data at Rest       | AES-256-GCM for PHI fields (diagnosis, prescriptions) |
| Input Validation   | Joi schemas + express-mongo-sanitize (NoSQL injection) |
| XSS Prevention     | DOMPurify (client) + xss-clean (server)               |
| Rate Limiting      | express-rate-limit (100 req/15min per IP)             |
| Video Signaling    | Ephemeral JWT room tokens (2hr TTL)                   |
| Audit Trail        | Immutable append-only audit_logs collection            |
| Secrets Management | dotenv + environment-specific .env files               |

---

## 6. CORE DEPENDENCIES

### Server (Node.js)
```json
{
  "express": "^4.18.x",
  "mongoose": "^8.x",
  "jsonwebtoken": "^9.x",
  "bcryptjs": "^2.x",
  "socket.io": "^4.x",
  "express-rate-limit": "^7.x",
  "express-mongo-sanitize": "^2.x",
  "xss-clean": "^0.1.x",
  "helmet": "^7.x",
  "joi": "^17.x",
  "nodemailer": "^6.x",
  "winston": "^3.x",
  "multer": "^1.x",
  "cors": "^2.x",
  "dotenv": "^16.x",
  "uuid": "^9.x",
  "node-cron": "^3.x"
}
```

### Client (React + Vite)
```json
{
  "react": "^18.x",
  "react-dom": "^18.x",
  "react-router-dom": "^6.x",
  "axios": "^1.x",
  "zustand": "^4.x",
  "socket.io-client": "^4.x",
  "dompurify": "^3.x",
  "simple-peer": "^9.x",
  "react-hot-toast": "^2.x",
  "lucide-react": "^0.x",
  "date-fns": "^3.x"
}
```

### ML Engine (Python)
```
fastapi==0.111.x
uvicorn==0.30.x
scikit-learn==1.5.x
pandas==2.x
numpy==1.x
joblib==1.x
pydantic==2.x
```

---

## 7. PHASE ROADMAP

| Phase | Scope                                      | Status     |
|-------|--------------------------------------------|------------|
| 1     | Architecture, Directory, DB Schemas         | ✅ COMPLETE |
| 2     | Core API, Security Middleware, Auth Layer   | 🔜 NEXT    |
| 3     | ML Triage Engine, Dijkstra Routing          | Pending    |
| 4     | React Frontend, WebRTC, Real-time UI        | Pending    |
