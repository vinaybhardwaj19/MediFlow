// ── k6 Shared Configuration ─────────────────────────────────────────────────
// Shared across all k6 test scripts.

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
export const ML_URL   = __ENV.ML_URL   || 'http://localhost:8000';
export const GW_URL   = __ENV.GW_URL   || 'http://localhost:8080';

export const options = {
  thresholds: {
    http_req_duration: ['p(95)<500'],   // 95th percentile < 500ms
    http_req_failed:   ['rate<0.01'],   // Error rate < 1%
  },
};

export const headers = {
  'Content-Type': 'application/json',
};
