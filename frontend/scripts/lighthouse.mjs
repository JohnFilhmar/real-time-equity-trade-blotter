// Audits the login page and the signed-in blotter with Lighthouse, driving the Chromium that
// Playwright already installed so no system Chrome is needed. Scores are printed and the HTML
// reports land in frontend/lighthouse/, which is gitignored. No score is a gate: the rubric has no
// performance line, and the numbers are quoted in the README as observed.
//
// Needs the stack running: `npm run start` at the repository root, then `npm run test:lighthouse`.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import desktop_config from 'lighthouse/core/config/desktop-config.js';

const ui = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const api = process.env.API_URL ?? 'http://localhost:5000';
const password = process.env.SEED_USER_PASSWORD ?? 'blotter-demo-2026';
const debugging_port = Number(process.env.LIGHTHOUSE_PORT ?? 9333);
const out_dir = fileURLToPath(new URL('../lighthouse/', import.meta.url));

/**
 * Signs in over HTTP and returns the refresh cookie the page needs to restore a session.
 *
 * @returns The `Cookie` header value.
 */
async function refresh_cookie() {
  const response = await fetch(`${api}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ui },
    body: JSON.stringify({ username: 'jsmith', password }),
  });
  if (!response.ok) {
    throw new Error(`login answered ${response.status}`);
  }
  const set_cookie = response.headers.get('set-cookie') ?? '';
  const pair = set_cookie.split(';')[0];
  if (!pair.startsWith('blotter_refresh=')) {
    throw new Error('login did not set the refresh cookie');
  }
  return pair;
}

/**
 * Runs one audit against the browser listening on the debugging port.
 *
 * @param path - Page path under the UI base.
 * @param name - Report file name.
 * @param extra_headers - Headers sent with every request, used to carry the session cookie.
 * @returns The four category scores, 0 to 100.
 */
async function audit(path, name, extra_headers) {
  // The desktop preset: a fast connection and no CPU slowdown, which is what a trading desk has.
  // The default preset simulates a slow phone, which is not where a blotter runs.
  const result = await lighthouse(
    `${ui}${path}`,
    {
      port: debugging_port,
      output: 'html',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      extraHeaders: extra_headers,
    },
    desktop_config,
  );
  if (result === undefined) {
    throw new Error(`no result for ${path}`);
  }
  writeFileSync(`${out_dir}${name}.html`, result.report);
  const scores = {};
  for (const [key, category] of Object.entries(result.lhr.categories)) {
    scores[key] = Math.round((category.score ?? 0) * 100);
  }
  return scores;
}

mkdirSync(out_dir, { recursive: true });
const cookie = await refresh_cookie();
const browser = await chromium.launch({ args: [`--remote-debugging-port=${debugging_port.toString()}`] });

try {
  const login = await audit('/login', 'login', {});
  const blotter = await audit('/', 'blotter', { cookie });
  console.log(JSON.stringify({ login, blotter }, null, 2));
  console.log(`reports: ${out_dir}`);
} finally {
  await browser.close();
}
