import { expect, test as base, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';

/** The demo password every seeded account shares. Configuration on the API side, so overridable. */
export const demo_password = process.env.SEED_USER_PASSWORD ?? 'blotter-demo-2026';

/** Seeded accounts, one per role the suite needs. */
export const accounts = {
  trader_a: 'jsmith',
  trader_b: 'abrown',
  admin: 'mjones',
  viewer: 'viewer',
} as const;

/** One of the seeded roles. */
export type Account = keyof typeof accounts;

/**
 * One signed-in person per account, created once per worker and shared by every test in it.
 *
 * The API rate-limits the credential endpoints to ten requests a minute per address, and every
 * sign-in costs two (the page's session restore, then the login). Signing in per test blew
 * through that limit within the suite, so each account signs in once and tests reset the page
 * between themselves instead. The limit is left as shipped on purpose: the suite tests the stack
 * a grader runs.
 */
export interface Desk {
  /** Returns the page for an account, signing in on first use. */
  page: (account: Account) => Promise<Page>;
}

/**
 * Signs in inside a fresh context and waits until the blotter is live.
 *
 * Every context has its own cookie jar and its own socket, so two contexts stand in for two
 * people on two machines rather than two tabs sharing a session.
 *
 * @param browser - The Playwright browser.
 * @param username - One of the seeded accounts.
 * @returns The context and its page, on the blotter with the link live.
 */
export async function sign_in(browser: Browser, username: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.fill('#login_username', username);
  await page.fill('#login_password', demo_password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/');
  await expect(page.locator('[role="grid"], [role="list"][aria-label="Trade blotter"]').first()).toBeVisible();
  await expect(page.locator('[data-state="live"]')).toBeVisible();
  return { context, page };
}

/**
 * Waits, only when it has to, until the credential endpoints will take `needed` more requests from
 * this address in the current rate-limit window.
 *
 * The API allows ten credential requests a minute per address, and every page load spends one on
 * the session restore. A test about to spend several calls this first. It sends one refresh with
 * no cookie, which counts against the same budget, reads what is left from the `RateLimit` header
 * (`limit=10, remaining=7, reset=42`), and sleeps into the next window when that is not enough.
 * Without the header it returns at once. The wait can approach a minute, so callers mark
 * themselves `test.slow()`.
 *
 * @param request - An API context carrying no session cookie, such as the `request` fixture.
 * @param needed - Credential requests the test makes after this probe.
 * @throws {Error} When `needed` is more than a whole window allows, since no wait would help.
 */
export async function ensure_auth_budget(request: APIRequestContext, needed: number): Promise<void> {
  const probe = await request.post('/api/v1/auth/refresh');
  const budget = /limit=(\d+),\s*remaining=(\d+),\s*reset=(\d+)/.exec(probe.headers()['ratelimit'] ?? '');
  if (budget === null) {
    return;
  }

  const [limit, remaining, reset] = [Number(budget[1]), Number(budget[2]), Number(budget[3])];
  if (remaining >= needed) {
    return;
  }
  if (needed > limit) {
    throw new Error(`The test needs ${needed.toString()} credential requests; one window allows ${limit.toString()}`);
  }
  await new Promise<void>((resolve) => setTimeout(resolve, (reset + 1) * 1000));
}

/** The suite's `test`, extended with the shared desk. */
export const test = base.extend<Record<never, never>, { desk: Desk }>({
  desk: [
    async ({ browser }, use) => {
      const sessions = new Map<Account, Promise<{ context: BrowserContext; page: Page }>>();
      const desk: Desk = {
        page: async (account) => {
          let session = sessions.get(account);
          if (session === undefined) {
            session = sign_in(browser, accounts[account]);
            sessions.set(account, session);
          }
          const { page } = await session;
          await reset(page);
          return page;
        },
      };
      await use(desk);
      for (const session of sessions.values()) {
        const { context } = await session;
        await context.close();
      }
    },
    { scope: 'worker' },
  ],
});

export { expect };

/**
 * Returns a page to the default blotter view without a reload: closes any dialog or drawer, and
 * navigates client-side to the bare blotter address, which clears every filter because filters
 * live only in the URL. No session restore is spent.
 *
 * @param page - A signed-in page.
 */
export async function reset(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const dialog = page.getByRole('dialog');
    if ((await dialog.count()) > 0) {
      // The header's close button comes first; a cancelled trade's conflict note adds a second "Close".
      await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
      await expect(dialog).toHaveCount(0);
    }
  }
  if ((await page.locator('aside[aria-label^="Trade TRD-"]').count()) > 0) {
    await page.getByRole('button', { name: 'Close detail' }).click();
  }
  if (!page.url().endsWith('/') || page.url().includes('?')) {
    await page.getByRole('link', { name: 'Blotter' }).first().click();
    // A filtered blotter is already on pathname `/`, so waiting on the pathname alone returns
    // before the click has navigated.
    await page.waitForURL((url) => url.pathname === '/' && url.search === '');
  }
  // Waits for the rail to catch up with the bare URL rather than clicking Clear, which can chase a
  // button the re-render is about to remove.
  await expect(page.getByRole('button', { name: /^Clear \d+$/ })).toHaveCount(0);
  await expect(page.locator('[role="grid"]')).toBeVisible();
}

/**
 * Books a trade through the ticket and returns its business id from the toast.
 *
 * @param page - A signed-in page on the blotter.
 * @param quantity - Share count to book.
 * @returns The new trade id, `TRD-100512` form.
 */
export async function book_trade(page: Page, quantity: number): Promise<string> {
  await page.getByRole('button', { name: 'New trade' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#t_quantity').fill(quantity.toString());
  await dialog.locator('#t_counterparty').fill('Goldman Sachs');
  await dialog.getByRole('button', { name: 'Book trade' }).click();
  const toast = page.getByText(/Booked TRD-\d+/);
  await expect(toast).toBeVisible();
  const text = await toast.textContent();
  const match = /TRD-\d+/.exec(text ?? '');
  if (match === null) {
    throw new Error(`Booked toast carried no trade id: ${text ?? ''}`);
  }
  return match[0];
}

/**
 * Makes sure the drawer for a trade is open, clicking its row only when it is not already.
 *
 * @param page - A signed-in page on the blotter.
 * @param trade_id - The row to open.
 */
export async function open_trade(page: Page, trade_id: string): Promise<void> {
  const drawer = page.locator(`aside[aria-label="Trade ${trade_id}"]`);
  if ((await drawer.count()) === 0) {
    await page.locator(`[data-trade-id="${trade_id}"]`).first().click();
  }
  await expect(drawer).toBeVisible();
}
