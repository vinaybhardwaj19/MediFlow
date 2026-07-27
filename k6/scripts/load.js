import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Configuration ────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const ML_URL   = __ENV.ML_URL   || 'http://localhost:8000';

// ── Custom Metrics ───────────────────────────────────────────────────────────
const errorRate    = new Rate('errors');
const triageTime   = new Trend('triage_response_time', true);
const authTime     = new Trend('auth_response_time', true);

// ── Load Profile: 50 VUs for 5 minutes ──────────────────────────────────────
export const options = {
  stages: [
    { duration: '30s', target: 20 },   // Ramp up
    { duration: '4m',  target: 50 },   // Sustain
    { duration: '30s', target: 0  },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],   // 95th percentile < 500ms
    errors:            ['rate<0.01'],   // Error rate < 1%
    triage_response_time: ['p(95)<800'],
  },
};

// ── Test Scenarios ───────────────────────────────────────────────────────────
export default function () {
  group('Health Checks', () => {
    const res = http.get(`${BASE_URL}/health`);
    check(res, {
      'backend health 200': (r) => r.status === 200,
    }) || errorRate.add(1);
  });

  group('Authentication Flow', () => {
    const loginPayload = JSON.stringify({
      email:    `loadtest_${__VU}@test.com`,
      password: 'TestPassword123!',
    });
    const params = { headers: { 'Content-Type': 'application/json' } };

    const res = http.post(`${BASE_URL}/api/v1/auth/login`, loginPayload, params);
    authTime.add(res.timings.duration);
    check(res, {
      'login returns 200 or 401': (r) => r.status === 200 || r.status === 401,
    }) || errorRate.add(1);
  });

  group('Triage Prediction', () => {
    const symptoms = [
      ['headache', 'fever', 'cough'],
      ['chest pain', 'shortness of breath'],
      ['nausea', 'abdominal pain', 'vomiting'],
      ['dizziness', 'fatigue', 'blurred vision'],
    ];
    const picked = symptoms[Math.floor(Math.random() * symptoms.length)];

    const payload = JSON.stringify({ symptoms: picked });
    const params  = { headers: { 'Content-Type': 'application/json' } };

    const res = http.post(`${ML_URL}/predict`, payload, params);
    triageTime.add(res.timings.duration);
    check(res, {
      'triage 200':           (r) => r.status === 200,
      'has specialty':        (r) => JSON.parse(r.body).recommendedSpecialty !== undefined,
      'has urgency':          (r) => JSON.parse(r.body).urgencyLevel !== undefined,
      'confidence 0-1':       (r) => {
        const c = JSON.parse(r.body).confidence;
        return c >= 0 && c <= 1;
      },
    }) || errorRate.add(1);
  });

  group('API Endpoints', () => {
    const res = http.get(`${BASE_URL}/api/v1/doctors`);
    check(res, {
      'doctors list 200': (r) => r.status === 200,
    }) || errorRate.add(1);
  });

  sleep(1);
}
