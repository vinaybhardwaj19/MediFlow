# MediFlow Enterprise — Deployment Guide

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/mediflow.git && cd mediflow

# 2. Copy environment template
cp .env.example .env

# 3. Generate secrets (Linux/macOS)
export ENCRYPTION_KEY=$(openssl rand -hex 32)
export JWT_ACCESS_SECRET=$(openssl rand -hex 32)
export JWT_REFRESH_SECRET=$(openssl rand -hex 32)
export MONGO_INITDB_ROOT_PASSWORD=$(openssl rand -hex 32)
export GF_SECURITY_ADMIN_PASSWORD=$(openssl rand -hex 16)

# 4. Start in development mode
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Deployment Environments

| Environment | Command | Config File |
|-------------|---------|-------------|
| Development | `bash scripts/deploy.sh dev` | `config/environments/dev.env` |
| Staging | `bash scripts/deploy.sh staging` | `config/environments/staging.env` |
| Production | `bash scripts/deploy.sh prod` | `config/environments/prod.env` |

## Environment Variables Reference

| Variable | Required | Type | Default | Description |
|----------|----------|------|---------|-------------|
| `NODE_ENV` | ✅ | string | `development` | Application environment (`development`/`staging`/`production`) |
| `PORT` | ✅ | integer | `5000` | Node.js server listen port |
| `LOG_LEVEL` | ❌ | string | `info` | Logging verbosity (`debug`/`info`/`warn`/`error`) |
| `MONGO_URI` | ✅ | string | — | MongoDB connection URI with auth credentials |
| `MONGO_INITDB_ROOT_USERNAME` | ✅ | string | — | MongoDB init root username |
| `MONGO_INITDB_ROOT_PASSWORD` | ✅ | string | — | MongoDB init root password (min 16 chars) |
| `ENCRYPTION_KEY` | ✅ | hex string | — | AES-256-GCM key (exactly 64 hex chars = 32 bytes) |
| `JWT_ACCESS_SECRET` | ✅ | string | — | JWT access token signing secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | ✅ | string | — | JWT refresh token signing secret (min 32 chars) |
| `KAFKA_BOOTSTRAP_SERVERS` | ❌ | string | `kafka:9092` | Kafka broker addresses |
| `KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR` | ❌ | integer | `1` | Kafka replication factor (3 for prod) |
| `GF_SECURITY_ADMIN_PASSWORD` | ❌ | string | — | Grafana admin password (min 8 chars) |
| `ML_ALLOWED_ORIGIN` | ❌ | URI | `http://localhost:5000` | CORS allowed origin for ML Engine |
| `GCP_PROJECT_ID` | ❌ | string | `mediflow-sentinel-2036` | Google Cloud project ID |
| `BIGQUERY_DATASET` | ❌ | string | `health_analytics` | BigQuery dataset name |
| `GATEWAY_PORT` | ❌ | integer | `8080` | Go API Gateway listen port |
| `DOMAIN` | ❌ | string | `mediflow.example.com` | Production domain for Caddy TLS |
| `GOOGLE_MAPS_API_KEY` | ❌ | string | — | Google Maps API key for geolocation |

## Validating Configuration

```bash
# Validate dev environment
python scripts/validate_env.py config/environments/dev.env

# Validate production environment
python scripts/validate_env.py config/environments/prod.env
```

## Service Ports

| Service | Internal Port | External Port | Notes |
|---------|--------------|---------------|-------|
| Caddy (HTTPS) | 80/443 | 80/443 | Auto-TLS with Let's Encrypt |
| Go Gateway | 8080 | — | Internal only (behind Caddy) |
| Node.js Server | 5000 | — | Internal only |
| ML Engine | 8000 | — | Internal only |
| MongoDB | 27017 | — | **Not exposed to host** (security) |
| Kafka | 9092 | — | Internal only |
| Prometheus | 9090 | 9090 | Metrics collection |
| Grafana | 3000 | 3000 | Monitoring dashboard |

## Production Checklist

- [ ] All `REPLACE_*` values in `config/environments/prod.env` have been set
- [ ] `python scripts/validate_env.py config/environments/prod.env` passes
- [ ] MongoDB port is NOT exposed to host (verify `docker-compose.yml`)
- [ ] Kafka replication factor is set to 3
- [ ] Grafana admin password is not the default
- [ ] TLS certificates are configured in Caddyfile
- [ ] Backup strategy is configured for MongoDB volumes
- [ ] Health endpoints are monitored: `/health` on all services

## Monitoring

Access Grafana dashboard at `http://localhost:3000`:
- Login: `admin` / `<GF_SECURITY_ADMIN_PASSWORD>`
- Pre-configured dashboards for Node.js, ML Engine, and Kafka metrics
- Prometheus data source auto-provisioned
