# Contributing to MediFlow Enterprise

Thank you for your interest in contributing to MediFlow! This guide covers our development workflow, code standards, and how to submit changes.

## Development Setup

```bash
# 1. Clone and install
git clone https://github.com/your-org/mediflow.git
cd mediflow

# 2. Start development stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# 3. Services available at:
#    - Frontend:       http://localhost:5000
#    - ML Engine:      http://localhost:8000/docs
#    - Go Gateway:     http://localhost:8080
#    - Grafana:        http://localhost:3000
```

## Project Structure

```
mediflow/
├── client/              # Vanilla JS frontend (SPA)
│   ├── js/              # ES6 modules (api, store, components)
│   └── src/types/       # TypeScript definitions (IDE support)
├── server/              # Node.js + Express backend
│   └── src/
│       ├── controllers/ # Route handlers
│       ├── models/      # Mongoose schemas (PHI encrypted)
│       ├── routes/      # 16 REST route modules
│       ├── middleware/   # Auth, RBAC, rate limiting, validation
│       └── services/    # Business logic (encryption, etc.)
├── ml-engine/           # Python FastAPI ML service
├── services/
│   ├── gateway/         # Go API gateway
│   ├── identity/        # PQC crypto (FIPS 203/204)
│   ├── triage/          # LSTM anomaly engine + Kafka
│   ├── pharmacy/        # 3D A* drone routing
│   └── analytics/       # BigQuery ML integration
├── k6/                  # Performance tests (smoke, load, stress, spike)
├── tests/               # Unit and integration tests
├── config/              # Environment configs + schema
├── monitoring/          # Prometheus + Grafana
└── docs/                # Architecture + API specs
```

## Code Standards

### JavaScript (Node.js + Frontend)
- ES6+ modules with `import`/`export`
- Express route handlers must use RBAC middleware
- All PHI fields encrypted via `encryption.service.js` hooks
- Joi validation on all mutating routes

### Python (ML Engine + Services)
- Type hints on all function signatures
- Docstrings with clinical references where applicable
- Async-first with `async`/`await`
- `logging` module, not `print()`

### Go (Gateway)
- Standard library only (no external dependencies)
- Structured logging

## Testing

```bash
# Run all unit tests
python -m unittest discover -s tests/unit -v

# Run specific test file
python -m unittest tests.unit.test_encryption -v

# Performance tests (requires k6)
k6 run k6/scripts/smoke.js
k6 run k6/scripts/load.js
```

## Environment Configuration

1. Copy `config/environments/dev.env` to `.env`
2. Validate: `python scripts/validate_env.py .env`
3. Generate secrets: `openssl rand -hex 32`

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for full reference.

## Pull Request Process

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes with clear commit messages
3. Run tests: `python -m unittest discover -s tests/unit -v`
4. Update documentation if adding new endpoints
5. Submit PR with description of changes

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system architecture with diagrams.

## License

MIT — see [LICENSE](LICENSE) for details.
