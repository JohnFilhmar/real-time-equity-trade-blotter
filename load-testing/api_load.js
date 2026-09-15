import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

// Four virtual users, one per seeded account, for sixty seconds, against the stack as shipped.
// The API rate-limits reads to 300 and writes to 60 a minute per user, so each iteration does
// two reads and at most three writes on a four second cycle: about 30 reads and 45 writes a
// minute per user, under both limits. The point is latency and correctness under concurrency,
// not capacity; a blotter desk does not hit 300 reads a minute per person.
//
// Run with the compose stack up:  k6 run load-testing/api_load.js
// Override the target with:        k6 run -e API_URL=http://localhost:3000 load-testing/api_load.js
//
// The API has no published port, so the load goes through the web server's forwarding, which is
// the path a browser takes.

const base = __ENV.API_URL || 'http://localhost:3000';
const password = __ENV.SEED_USER_PASSWORD || 'FusionDemo!2026';
const accounts = ['jsmith', 'abrown', 'mjones', 'viewer'];

export const options = {
  scenarios: {
    desk: {
      executor: 'constant-vus',
      vus: accounts.length,
      duration: __ENV.DURATION || '60s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300'],
    'http_req_duration{name:list_trades}': ['p(95)<300'],
    'http_req_duration{name:create_trade}': ['p(95)<300'],
  },
};

const list_trend = new Trend('list_trades_ms');
const write_trend = new Trend('write_trade_ms');

const json = { headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' } };

/** Signs one virtual user in on its first iteration; the token is reused afterwards. */
function sign_in(username) {
  const response = http.post(`${base}/api/v1/auth/login`, JSON.stringify({ username, password }), {
    ...json,
    tags: { name: 'login' },
  });
  check(response, { 'login answers 200': (r) => r.status === 200 });
  return response.json('accessToken');
}

let token = null;
let can_write = false;

export default function () {
  const username = accounts[(__VU - 1) % accounts.length];

  if (token === null) {
    token = sign_in(username);
    can_write = username !== 'viewer';
  }

  const auth = { headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } };

  const list = http.get(`${base}/api/v1/trades?limit=100`, { ...auth, tags: { name: 'list_trades' } });
  check(list, { 'list answers 200': (r) => r.status === 200, 'list carries data': (r) => Array.isArray(r.json('data')) });
  list_trend.add(list.timings.duration);

  const first = list.json('data.0.tradeId');
  if (first) {
    const one = http.get(`${base}/api/v1/trades/${first}`, { ...auth, tags: { name: 'get_trade' } });
    check(one, { 'read answers 200': (r) => r.status === 200 });
  }

  if (can_write) {
    const payload = {
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 100 + (__ITER % 9) * 100,
      price: 227.45,
      book: 'EQUITIES_US',
      counterparty: 'k6 load test',
      tradeTimestamp: new Date().toISOString(),
    };
    const created = http.post(`${base}/api/v1/trades`, JSON.stringify(payload), { ...auth, tags: { name: 'create_trade' } });
    check(created, { 'create answers 201': (r) => r.status === 201 });
    write_trend.add(created.timings.duration);

    if (created.status === 201) {
      const trade_id = created.json('tradeId');
      const version = created.json('version');

      const amended = http.patch(
        `${base}/api/v1/trades/${trade_id}`,
        JSON.stringify({ version, quantity: 1500 }),
        { ...auth, tags: { name: 'amend_trade' } },
      );
      check(amended, { 'amend answers 200': (r) => r.status === 200 });
      write_trend.add(amended.timings.duration);

      const cancelled = http.post(
        `${base}/api/v1/trades/${trade_id}/cancel`,
        JSON.stringify({ version: amended.json('version') }),
        { ...auth, tags: { name: 'cancel_trade' } },
      );
      check(cancelled, { 'cancel answers 200': (r) => r.status === 200 });
      write_trend.add(cancelled.timings.duration);
    }
  }

  sleep(4);
}
