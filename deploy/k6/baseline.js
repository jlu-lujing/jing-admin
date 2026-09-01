import http from "k6/http";
import { check, sleep } from "k6";

// 基线压测：k6 run -e BASE=http://127.0.0.1:9800 deploy/k6/baseline.js
export const options = {
  stages: [
    { duration: "30s", target: 50 },
    { duration: "1m", target: 200 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<250", "p(99)<600"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE = __ENV.BASE || "http://127.0.0.1:9800";

export function setup() {
  const r = http.post(`${BASE}/api/auth/login`, JSON.stringify({ username: "admin", password: "admin123" }), {
    headers: { "Content-Type": "application/json" },
  });
  return { token: JSON.parse(r.body).data.accessToken };
}

export default function (data) {
  const res = http.get(`${BASE}/api/dashboard/overview`, {
    headers: { Authorization: `Bearer ${data.token}` },
  });
  check(res, { "dashboard 200": (r) => r.status === 200 });
  http.get(`${BASE}/api/users?page=1&pageSize=10`, { headers: { Authorization: `Bearer ${data.token}` } });
  sleep(1);
}
