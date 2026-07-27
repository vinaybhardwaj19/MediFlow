import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const ML_URL   = __ENV.ML_URL   || 'http://localhost:8000';
const errorRate = new Rate('errors');

// ── Spike Profile: Sudden burst from 10 → 500 VUs ──────────────────────────
export const options = {
  stages: [
    { duration: '30s', target: 10  },   // Warm up
    { duration: '10s', target: 500 },   // SPIKE — instant 500 users
    { duration: '1m',  target: 500 },   // Hold spike
    { duration: '30s', target: 10  },   // Recovery
    { duration: '1m',  target: 10  },   // Stabilize
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],  // Very relaxed: 5s during spike
    errors:            ['rate<0.10'],   // Up to 10% errors during spike
  },
};

export default function () {
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health responds': (r) => r.status === 200 || r.status === 503,
  }) || errorRate.add(1);

  const payload = JSON.stringify({
    symptoms: ['fever', 'headache'],
  });
  const triageRes = http.post(`${ML_URL}/predict`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(triageRes, {
    'triage responds': (r) => r.status === 200 || r.status === 503,
  }) || errorRate.add(1);

  sleep(0.3);
}
