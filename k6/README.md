# k6 Load Testing — MediFlow Enterprise

Performance and load testing suite using [Grafana k6](https://k6.io/).

## Prerequisites

```bash
# Install k6
# macOS
brew install k6

# Windows
choco install k6

# Docker
docker run --rm -i grafana/k6 run - <script.js
```

## Test Scripts

| Script | Purpose | VUs | Duration |
|--------|---------|-----|----------|
| `scripts/smoke.js` | Basic health check — verify endpoints are alive | 1 | ~10s |
| `scripts/load.js` | Sustained load — normal traffic simulation | 50 | 5 min |
| `scripts/stress.js` | Find breaking points — ramp to 200 VUs | 10→200 | 10 min |
| `scripts/spike.js` | Sudden traffic spike — resilience testing | 10→500 | 3 min |

## Running Tests

```bash
# Smoke test (quick check)
k6 run k6/scripts/smoke.js

# Load test (standard)
k6 run k6/scripts/load.js

# Stress test (find limits)
k6 run k6/scripts/stress.js

# Spike test (sudden burst)
k6 run k6/scripts/spike.js

# Custom base URL
k6 run -e BASE_URL=https://staging.mediflow.com -e ML_URL=https://staging.mediflow.com/ml k6/scripts/load.js
```

## Pass/Fail Thresholds

| Metric | Smoke/Load | Stress | Spike |
|--------|-----------|--------|-------|
| p95 Response Time | < 500ms | < 2,000ms | < 5,000ms |
| Error Rate | < 1% | < 5% | < 10% |

## Interpreting Results

```
✓ triage 200               — Endpoint responded correctly
✓ has specialty             — Response includes specialty field
✓ confidence 0-1            — Confidence within valid range

http_req_duration...........: avg=45ms  min=12ms  p(95)=120ms  max=890ms
http_req_failed.............: 0.12%    ✓ 4892   ✗ 6
iterations..................: 4898     16.33/s
```

- **avg**: Average response time — target < 100ms
- **p(95)**: 95th percentile — this is your SLA metric
- **http_req_failed**: Error rate — must stay under threshold
- **iterations**: Total completed request cycles
