import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const ML_URL   = __ENV.ML_URL   || 'http://localhost:8000';
const errorRate = new Rate('errors');

// ── Stress Profile: Ramp 10 → 200 VUs over 10 minutes ──────────────────────
export const options = {
  stages: [
    { duration: '1m',  target: 10  },
    { duration: '2m',  target: 50  },
    { duration: '2m',  target: 100 },
    { duration: '2m',  target: 150 },
    { duration: '2m',  target: 200 },   // Peak stress
    { duration: '1m',  target: 0   },   // Recovery
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],   // Relaxed: 2s at stress
    errors:            ['rate<0.05'],    // Up to 5% errors acceptable under stress
  },
};

export default function () {
  group('Health Under Stress', () => {
    const res = http.get(`${BASE_URL}/health`);
    check(res, { 'health 200': (r) => r.status === 200 }) || errorRate.add(1);
  });

  group('Triage Under Stress', () => {
    const symptoms = ['headache', 'fever', 'cough', 'fatigue'];
    const payload = JSON.stringify({
      symptoms: symptoms.slice(0, Math.floor(Math.random() * 3) + 1),
    });
    const params = { headers: { 'Content-Type': 'application/json' } };

    const res = http.post(`${ML_URL}/predict`, payload, params);
    check(res, {
      'triage returns 200': (r) => r.status === 200,
    }) || errorRate.add(1);
  });

  group('Auth Under Stress', () => {
    const payload = JSON.stringify({
      email: `stress_${__VU}_${__ITER}@test.com`,
      password: 'StressTest123!',
    });
    const params = { headers: { 'Content-Type': 'application/json' } };
    const res = http.post(`${BASE_URL}/api/v1/auth/login`, payload, params);
    check(res, {
      'auth responds': (r) => r.status === 200 || r.status === 401,
    }) || errorRate.add(1);
  });

  sleep(0.5);
}
