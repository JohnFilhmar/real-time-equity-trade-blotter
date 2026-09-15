// Captures the README's lead image: two live instances of the blotter side by side, a trade
// booked in the left one appearing on the right one without a refresh. One page holds two
// iframes of the app, each with its own session and its own socket, so the screenshot is of the
// real thing rather than a composite. Writes docs/readme/two_windows.png.
//
// Needs the stack running: `npm run start` at the repository root, then `npm run capture:readme`.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ui = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const password = process.env.SEED_USER_PASSWORD ?? 'FusionDemo!2026';
const out_dir = fileURLToPath(new URL('../../docs/readme/', import.meta.url));
mkdirSync(out_dir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 760 }, colorScheme: 'dark' });

await page.setContent(`
  <style>
    body { margin: 0; background: #060A12; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px; box-sizing: border-box; height: 100vh; }
    figure { margin: 0; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
    figcaption { font: 600 12px/1 "IBM Plex Mono", Consolas, monospace; letter-spacing: .1em; text-transform: uppercase; color: #67E8F9; }
    iframe { flex: 1; border: 1px solid rgba(120,200,220,.22); border-radius: 10px; background: #0B111C; }
  </style>
  <figure><figcaption>Window A · jsmith books a trade</figcaption><iframe id="a" src="${ui}/login"></iframe></figure>
  <figure><figcaption>Window B · abrown sees it arrive, no refresh</figcaption><iframe id="b" src="${ui}/login"></iframe></figure>
`);

const a = page.frameLocator('#a');
const b = page.frameLocator('#b');

/**
 * Signs one iframe in. The refresh cookie is shared by both iframes, but each keeps its own
 * access token in memory, so signing in sequentially leaves two distinct sessions on screen.
 */
async function sign_in(frame, username) {
  await frame.locator('#login_username').fill(username);
  await frame.locator('#login_password').fill(password);
  await frame.locator('button[type="submit"]').click();
  await frame.locator('[data-state="live"]').waitFor({ timeout: 30000 });
}

await sign_in(a, 'jsmith');
await sign_in(b, 'abrown');

await a.getByRole('button', { name: 'New trade' }).first().click();
const ticket = a.getByRole('dialog');
await ticket.locator('#t_quantity').fill('7500');
await ticket.locator('#t_counterparty').fill('Goldman Sachs');
await ticket.getByRole('button', { name: 'Book trade' }).click();
const toast = a.getByText(/Booked TRD-\d+/);
await toast.waitFor();
const trade_id = /TRD-\d+/.exec((await toast.textContent()) ?? '')?.[0];
if (trade_id === undefined) {
  throw new Error('no trade id in the toast');
}

const row_on_b = b.locator(`[data-trade-id="${trade_id}"]`).first();
await row_on_b.waitFor({ timeout: 15000 });
await page.waitForTimeout(600);

await page.screenshot({ path: join(out_dir, 'two_windows.png') });
console.log(`captured ${trade_id} in both windows`);
await browser.close();
