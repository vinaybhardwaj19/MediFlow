import { check, sleep } from 'k6';
import http from 'k6/http';

export let options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp-up to 100 VUs
    { duration: '5m', target: 100 }, // Sustain for 5 min
    { duration: '1m', target: 0 },   // Ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
  
  let resHealth = http.get(`${BASE_URL}/health`);
  check(resHealth, {
    'health status is 200': (r) => r.status === 200,
  });

  let resAuth = http.get(`${BASE_URL}/api/v1/auth`);
  check(resAuth, {
    'auth status is 200-401': (r) => r.status === 200 || r.status === 401,
  });

  sleep(1);
}
