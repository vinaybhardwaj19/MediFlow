# Security Policy — MediFlow Enterprise

## Supported Versions

| Version | Supported | Notes |
|---------|-----------|-------|
| 2.x.x | ✅ Active | Current release — receives security patches |
| 1.x.x | ❌ EOL | No longer maintained |

## Reporting a Vulnerability

**DO NOT** open a public GitHub issue for security vulnerabilities.

1. Email **security@mediflow.local** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Affected component (server, ml-engine, gateway, identity)
   - Potential impact assessment
2. PGP Key: Available upon request

## Response Timeline

| Stage | SLA |
|-------|-----|
| Acknowledge receipt | ≤ 24 hours |
| Triage & severity assessment | ≤ 72 hours |
| Patch for Critical/High | ≤ 7 days |
| Patch for Medium/Low | ≤ 30 days |

## Security Architecture

### Encryption
| Layer | Algorithm | Standard |
|-------|-----------|----------|
| PHI at Rest | AES-256-GCM | NIST SP 800-38D |
| Key Encapsulation | Kyber-768 (ML-KEM) | NIST FIPS 203 |
| Digital Signatures | Dilithium-3 (ML-DSA) | NIST FIPS 204 |
| TLS in Transit | TLS 1.3 (Caddy auto) | RFC 8446 |

### Authentication & Authorization
- **JWT**: Access tokens (15min TTL) + Refresh tokens (7d, HttpOnly cookie)
- **RBAC**: 5 roles — `patient`, `doctor`, `pharmacist`, `rider`, `admin`
- **Rate Limiting**: Token-bucket at Go gateway + Express rate limiter
- **Input Validation**: Joi schemas on all mutating REST endpoints

### Infrastructure Security
- MongoDB: Internal Docker network only (port not exposed to host)
- Secrets: Environment variables, never hardcoded — Gitleaks CI scan
- Headers: Helmet.js (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- CORS: Whitelist-only origins via `ML_ALLOWED_ORIGIN`

### Compliance
- **HIPAA**: Field-level PHI encryption, audit logging, RBAC access controls
- **India DPDP Act 2023**: Data export (`/data-rights/export`) and erasure (`/data-rights/erase`)

## Out of Scope

- Social engineering attacks
- Denial of Service (DoS) on shared infrastructure
- Issues in third-party dependencies (report to upstream)
- Vulnerabilities requiring physical access to hardware
