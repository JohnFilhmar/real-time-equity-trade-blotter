// Runs the shared Zod schemas over a fixed set of inputs and records exactly what each one says:
// the field errors the API's 422 carried, or the parsed value when the input passed. The gateway's
// FluentValidation rules are tested against this file, so the .NET API answers every one of these
// inputs with the same fields and the same sentences the Node API did.
//
//   node scripts/export_zod_cases.mjs           rewrites the fixture
//   node scripts/export_zod_cases.mjs --check   fails when the schemas and the fixture disagree
//
// Bodies are kept as raw JSON text, because some inputs (1e400, 9007199254740993) only exist as text.
// A body of null means no body was sent. Query values are strings, or arrays when a key repeats,
// which is what Express's simple query parser produced.

import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import {
  amend_trade_schema,
  cancel_trade_schema,
  create_trade_schema,
  login_request_schema,
  trade_event_query_schema,
  trade_id_pattern,
  trade_query_schema,
} from '@blotter/shared';

const fixture_path = new URL(
  '../services/gateway/tests/Blotter.Gateway.Tests/Fixtures/zod_cases.json',
  import.meta.url,
);

// The route parameter check lived in backend/src/routes/trade_routes.ts, not the shared package.
const trade_params_schema = z.object({
  trade_id: z.string().regex(trade_id_pattern, 'trade id must look like TRD-100001'),
});

const ticket = {
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 5000,
  price: 227.45,
  book: 'EQUITIES_US',
  counterparty: 'Goldman Sachs',
  tradeTimestamp: '2026-08-18T09:15:23.000Z',
};

/** A ticket with some fields replaced, as JSON text. Undefined removes a field. */
function ticket_with(overrides) {
  return JSON.stringify({ ...ticket, ...overrides });
}

/** A ticket as JSON text with one field's raw value spliced in, for numbers JSON.stringify cannot write. */
function ticket_raw(field, raw) {
  return JSON.stringify({ ...ticket, [field]: '__RAW__' }).replace('"__RAW__"', raw);
}

const body_cases = {
  login: [
    '{"username":"jsmith","password":"pw"}',
    '{"username":"  jsmith  ","password":"pw"}',
    '{"username":"jsmith\\n","password":"pw"}',
    '{"username":"jsmith","password":"pw","extra":1}',
    '{}',
    '{"username":"","password":""}',
    '{"username":"   ","password":"x"}',
    '{"username":"a user","password":"x"}',
    `{"username":"${'x'.repeat(65)}","password":"x"}`,
    `{"username":"ok","password":"${'x'.repeat(201)}"}`,
    '{"username":123,"password":true}',
    '{"username":null,"password":null}',
    '{"username":"j\\u00e9","password":"x"}',
    '{"username":"\\u00a0jsmith\\ufeff","password":"pw"}',
    '{"username":"\\u0085jsmith","password":"pw"}',
    '{"username":"jsmith","password":"  "}',
    '[]',
    null,
  ],
  create_trade: [
    ticket_with({}),
    ticket_with({ trader: 'SOMEONE_ELSE', currency: 'GBX', status: 'CANCELLED', version: 9 }),
    ticket_with({ book: '  EQUITIES_UK  ', counterparty: ' Nomura﻿' }),
    ticket_with({ quantity: 0, counterparty: '' }),
    ticket_with({ quantity: -5 }),
    ticket_with({ quantity: 1.5 }),
    ticket_with({ quantity: -1.5 }),
    ticket_with({ quantity: 10000001 }),
    ticket_with({ quantity: 10000000 }),
    ticket_with({ quantity: 1e20 }),
    ticket_with({ quantity: '100' }),
    ticket_with({ quantity: null }),
    ticket_with({ quantity: true }),
    ticket_with({ quantity: undefined }),
    ticket_raw('quantity', '100.0'),
    ticket_raw('quantity', '1e3'),
    ticket_raw('quantity', '9007199254740993'),
    ticket_with({ price: 0 }),
    ticket_with({ price: -1 }),
    ticket_with({ price: 10000000 }),
    ticket_with({ price: 10000000.5 }),
    ticket_raw('price', '1e300'),
    ticket_raw('price', '1e400'),
    ticket_with({ price: '5' }),
    ticket_with({ price: null }),
    ticket_with({ price: undefined }),
    ticket_with({ price: 227.4500001 }),
    ticket_with({ symbol: 'ZZZZ' }),
    ticket_with({ symbol: 'aapl' }),
    ticket_with({ symbol: null }),
    ticket_with({ symbol: undefined }),
    ticket_with({ symbol: 5 }),
    ticket_with({ symbol: 'HSBA.L', price: 982 }),
    ticket_with({ side: 'buy' }),
    ticket_with({ side: 'HOLD' }),
    ticket_with({ side: null }),
    ticket_with({ side: undefined }),
    ticket_with({ book: '' }),
    ticket_with({ book: '   ' }),
    ticket_with({ book: 'x'.repeat(64) }),
    ticket_with({ book: 'x'.repeat(65) }),
    ticket_with({ book: 5 }),
    ticket_with({ book: null }),
    ticket_with({ counterparty: '' }),
    ticket_with({ counterparty: 'x'.repeat(129) }),
    ticket_with({ counterparty: null }),
    ticket_with({ tradeTimestamp: '2999-01-01T00:00:00.000Z' }),
    ticket_with({ tradeTimestamp: '2999-01-01T00:00:00.000Z', quantity: 0 }),
    ticket_with({ tradeTimestamp: '2999-01-01T00:00:00.000Z', symbol: 'ZZZZ' }),
    ticket_with({ tradeTimestamp: '2999-01-01T00:00:00.000Z', quantity: '7' }),
    ticket_with({ tradeTimestamp: '2999-01-01T00:00:00.000Z', quantity: 10000001 }),
    ticket_with({ tradeTimestamp: '2999-01-01T00:00:00.000Z', quantity: 1.5 }),
    ticket_with({ tradeTimestamp: '2999-01-01T00:00:00.000Z', price: 0 }),
    ticket_with({ tradeTimestamp: '2999-01-01T00:00:00.000Z', price: '1' }),
    ticket_with({ tradeTimestamp: '2999-01-01T00:00:00.000Z', side: 'HOLD' }),
    ticket_with({ tradeTimestamp: '2999-01-01T00:00:00.000Z', book: '' }),
    ticket_with({ tradeTimestamp: '2999-01-01T00:00:00.000Z', book: 5 }),
    ticket_with({ tradeTimestamp: '2999-01-01T00:00:00.000Z', counterparty: 'x'.repeat(129) }),
    ticket_with({ tradeTimestamp: '2999-01-01' }),
    ticket_with({ tradeTimestamp: '2999-01-01T00:00Z' }),
    ticket_with({ tradeTimestamp: '2026-08-18' }),
    ticket_with({ tradeTimestamp: '2026-08-18T09:15Z' }),
    ticket_with({ tradeTimestamp: '2026-08-18T09:15:23+01:00' }),
    ticket_with({ tradeTimestamp: '2026-02-30T00:00:00Z' }),
    ticket_with({ tradeTimestamp: '2024-02-29T00:00:00Z' }),
    ticket_with({ tradeTimestamp: '2026-08-18T09:15:23.123456789Z' }),
    ticket_with({ tradeTimestamp: '2026-08-18T24:00:00Z' }),
    ticket_with({ tradeTimestamp: '2026-08-18 09:15:23Z' }),
    ticket_with({ tradeTimestamp: 5 }),
    ticket_with({ tradeTimestamp: null }),
    ticket_with({ tradeTimestamp: undefined }),
    '{}',
    '[]',
    null,
  ],
  amend_trade: [
    '{"version":1,"quantity":100}',
    '{"version":1}',
    '{"version":1,"price":230.1,"book":"  TECH_GROWTH "}',
    '{"version":1,"symbol":"MSFT","side":"SELL","quantity":100}',
    '{}',
    '{"version":0}',
    '{"version":1.5}',
    '{"version":-1.5}',
    '{"version":"1"}',
    '{"version":null}',
    '{"version":1,"quantity":100,"counterparty":"Nomura"}',
    '{"version":1,"counterparty":null}',
    '{"version":1,"quantity":null}',
    '{"version":1,"quantity":0,"price":-1,"book":"   "}',
    '{"version":1,"price":0}',
    '{"quantity":0}',
    '[]',
    null,
  ],
  cancel_trade: ['{}', '{"version":2}', '{"version":0}', '{"version":"x"}', '{"version":null}', '[]', null],
};

const query_cases = {
  trade_query: [
    {},
    { limit: '2' },
    { limit: '5000' },
    { limit: '0' },
    { limit: 'abc' },
    { limit: '' },
    { limit: '1.5' },
    { limit: '0x10' },
    { limit: ' 50 ' },
    { limit: '1e2' },
    { limit: 'Infinity' },
    { limit: ['5', '6'] },
    { side: 'buy' },
    { side: 'SELL', status: 'CANCELLED' },
    { side: 'HOLD' },
    { status: 'OPEN' },
    { sort_by: 'price', sort_dir: 'asc' },
    { sort_by: 'nope' },
    { sort_dir: 'DESC' },
    { date_from: '2026-08-18T12:00:00.000Z', date_to: '2026-08-18T09:00:00.000Z' },
    { date_from: '2026-08-18T09:15:23.000Z', date_to: '2026-08-18T09:15:23.000Z' },
    { date_from: 'garbage' },
    { date_from: 'garbage', date_to: '2026-01-01T00:00:00Z' },
    { date_from: '2026-08-18T12:00:00.000Z', date_to: 'garbage' },
    { date_from: '2026-08-18T12:00:00.000Z', date_to: '2026-08-18T09:00:00.000Z', side: 'HOLD' },
    { date_from: '2026-08-18T12:00:00.000Z', date_to: '2026-08-18T09:00:00.000Z', limit: '0' },
    { date_from: '2026-08-18T12:00:00.000Z', date_to: '2026-08-18T09:00:00.000Z', limit: 'abc' },
    { date_from: '2026-08-18T12:00:00.000Z', date_to: '2026-08-18T09:00:00.000Z', limit: '1.5' },
    { date_from: '2026-08-18T12:00:00.000Z', date_to: '2026-08-18T09:00:00.000Z', sort_by: 'nope' },
    { date_from: '2026-08-18T12:00:00.000Z', date_to: '2026-08-18T09:00:00.000Z', symbol: ['a', 'b'] },
    { date_from: '2026-08-18', date_to: '2026-08-17' },
    { date_from: ['2026-08-18T12:00:00.000Z', 'x'] },
    { symbol: ['a', 'b'] },
    { cursor: ['a', 'b'] },
    { symbol: '', book: 'equities', counterparty: 'morgan', trader: 'js', cursor: 'abc' },
    { extra: 'x' },
  ],
  event_query: [
    {},
    { limit: '2' },
    { limit: '0' },
    { limit: '501' },
    { limit: '500' },
    { limit: 'abc' },
    { limit: '2.5' },
    { limit: '' },
    { limit: ['1', '2'] },
    { limit: 'Infinity' },
    { limit: '-1' },
    { limit: '1e2' },
    { limit: ' 7 ' },
    { cursor: ['a', 'b'] },
    { cursor: 'abc' },
  ],
  trade_params: [
    { trade_id: 'TRD-100001' },
    { trade_id: 'TRD-1000000' },
    { trade_id: 'nonsense' },
    { trade_id: 'TRD-12345' },
    { trade_id: 'trd-100001' },
    { trade_id: 'TRD-100001x' },
  ],
};

const schemas = {
  login: login_request_schema,
  create_trade: create_trade_schema,
  amend_trade: amend_trade_schema,
  cancel_trade: cancel_trade_schema,
  trade_query: trade_query_schema,
  event_query: trade_event_query_schema,
  trade_params: trade_params_schema,
};

/** Validates one input the way the Node routes did, and records the outcome. */
function run(schema_name, input, body) {
  const result = schemas[schema_name].safeParse(input);
  const outcome = result.success
    ? { ok: true, output: result.data }
    : {
        ok: false,
        errors: result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
      };
  return body === undefined ? { schema: schema_name, query: input, ...outcome } : { schema: schema_name, body, ...outcome };
}

const cases = [];

for (const [schema_name, bodies] of Object.entries(body_cases)) {
  for (const body of bodies) {
    // The cancel route parsed `req.body ?? {}`; the others parsed `req.body` as it was.
    const parsed = body === null ? (schema_name === 'cancel_trade' ? {} : undefined) : JSON.parse(body);
    cases.push(run(schema_name, parsed, body));
  }
}

for (const [schema_name, queries] of Object.entries(query_cases)) {
  for (const query of queries) {
    cases.push(run(schema_name, query));
  }
}

const text = `${JSON.stringify({ zod: '4', cases }, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const current = readFileSync(fixture_path, 'utf8').replace(/\r\n/g, '\n');
  if (current !== text) {
    console.error('zod_cases.json is out of date with the shared schemas. Run: node scripts/export_zod_cases.mjs');
    process.exit(1);
  }
  console.log(`zod_cases.json matches the shared schemas (${cases.length} cases)`);
} else {
  writeFileSync(fixture_path, text);
  console.log(`wrote ${cases.length} cases to ${fixture_path.pathname}`);
}
