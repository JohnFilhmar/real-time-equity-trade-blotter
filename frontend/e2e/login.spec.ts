import { ensure_auth_budget, expect, test } from './test-utils';

// The door, as a person arriving at it sees it: the desk panel and the heading are on screen
// before the session check answers, the clock runs, the readiness line reports the API, Sign in
// with blank boxes says what is missing under each box and sends nothing, a wrong password lands in
// the reserved line without moving the button, and the theme can be changed before signing in.
// Signing in itself is covered by every other journey through the shared desk.
test.describe('the login page @critical', () => {
  test('shows the desk, keeps the form still on an error, and offers the theme switch', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const login_requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/v1/auth/login')) {
        login_requests.push(request.url());
      }
    });
    await page.goto('/login');

    await expect(page.getByRole('complementary', { name: 'Desk' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Theme' })).toBeVisible();
    await expect(page.locator('[data-backdrop] img')).toHaveCount(3);

    const clock = page.locator('time').first();
    await expect(clock).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    const first_reading = await clock.textContent();
    await expect.poll(() => clock.textContent(), { timeout: 3_000 }).not.toBe(first_reading);

    await expect(page.getByRole('status').filter({ hasText: /ready/ }).first()).toBeVisible();

    const submit = page.getByRole('button', { name: 'Sign in to the desk' });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.locator('#login_username_message')).toHaveText('Enter your username');
    await expect(page.locator('#login_password_message')).toHaveText('Enter your password');
    expect(login_requests).toHaveLength(0);

    // A name no account has, so repeated runs never build up failures against a shared one.
    await page.fill('#login_username', `nobody_e2e_${Math.random().toString(36).slice(2, 10)}`);
    await page.fill('#login_password', 'not-the-password');

    const before = await submit.boundingBox();
    await submit.click();
    const alert = page.locator('form').getByRole('alert');
    await expect(alert).toContainText('Username or password is incorrect');
    const after = await submit.boundingBox();
    expect(after?.y).toBe(before?.y);

    await context.close();
  });

  // Five failures lock an account, and the fifth answer is the lock itself: a 429 with the
  // locked_out code and a Retry-After header. The browser remembers the lock against the username,
  // so a reload does not hand back a sign-in button the API would refuse. The name belongs to no
  // account, so the run never locks a demo login; an unknown name locks exactly like a real one.
  test('a locked account counts down from the fifth failure, and the countdown is back after a reload', async ({ browser, request }) => {
    test.slow();
    // One session restore on arrival, five attempts, and one restore after the reload.
    await ensure_auth_budget(request, 7);

    const username = `lockout_e2e_${Math.random().toString(36).slice(2, 10)}`;
    const context = await browser.newContext();
    const page = await context.newPage();
    const submit = page.getByRole('button', { name: 'Sign in to the desk' });
    const alert = page.locator('form').getByRole('alert');
    const countdown = /Too many failed attempts\. Try again in \d+:\d{2}\./;
    const login_answer = () => page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/login'));

    await page.goto('/login');
    await page.fill('#login_username', username);
    await page.fill('#login_password', 'not-the-password');

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const answer = login_answer();
      await submit.click();
      expect((await answer).status()).toBe(401);
      await expect(alert).toContainText('Username or password is incorrect');
      await expect(submit).toBeEnabled();
    }

    const locked_answer = login_answer();
    await submit.click();
    const locked = await locked_answer;
    expect(locked.status()).toBe(429);
    expect(Number(locked.headers()['retry-after'])).toBeGreaterThan(0);
    expect(await locked.json()).toMatchObject({ code: 'locked_out', detail: expect.stringContaining('Too many failed attempts') });
    await expect(alert).toContainText(countdown);
    await expect(submit).toBeDisabled();

    await page.reload();
    await page.fill('#login_username', username);
    await page.fill('#login_password', 'not-the-password');
    await expect(alert).toContainText(countdown);
    await expect(submit).toBeDisabled();

    await context.close();
  });
});
