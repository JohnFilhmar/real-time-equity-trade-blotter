import { expect, test } from './test-utils';

// The door, as a person arriving at it sees it: the desk panel and the heading are on screen
// before the session check answers, the clock runs, the readiness line reports the API, a wrong
// password lands in the reserved line without moving the button, and the theme can be changed
// before signing in. Signing in itself is covered by every other journey through the shared desk.
test.describe('the login page @critical', () => {
  test('shows the desk, keeps the form still on an error, and offers the theme switch', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login');

    await expect(page.getByRole('complementary', { name: 'Desk' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Theme' })).toBeVisible();

    const clock = page.locator('time').first();
    await expect(clock).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    const first_reading = await clock.textContent();
    await expect.poll(() => clock.textContent(), { timeout: 3_000 }).not.toBe(first_reading);

    await expect(page.getByRole('status').filter({ hasText: /ready/ }).first()).toBeVisible();

    const submit = page.getByRole('button', { name: 'Sign in to the desk' });
    await expect(submit).toBeDisabled();
    await page.fill('#login_username', 'nobody');
    await page.fill('#login_password', 'not-the-password');
    await expect(submit).toBeEnabled();

    const before = await submit.boundingBox();
    await submit.click();
    const alert = page.locator('form').getByRole('alert');
    await expect(alert).toContainText('Username or password is incorrect');
    const after = await submit.boundingBox();
    expect(after?.y).toBe(before?.y);

    await context.close();
  });
});
