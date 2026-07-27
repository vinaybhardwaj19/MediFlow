import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, options } from '../config.js';

export { options };

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  sleep(1);
}
