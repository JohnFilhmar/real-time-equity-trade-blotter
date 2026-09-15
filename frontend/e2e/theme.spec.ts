import { ensure_auth_budget, expect, test } from './test-utils';

// A pinned theme outlives a reload wherever the switch lives: the login page and the top bar. The
// root layout's inline script stamps the stored choice before first paint, and the theme provider
// stamps it again once the page hydrates. Each test starts in the opposite OS preference, so a page
// that fell back to the OS would show the wrong theme.
test.describe('theme choice', () => {
  test('the login page keeps a pinned theme through a reload, even before hydration', async ({ browser, request }) => {
    test.slow();
    // Two page loads restore the session; the third load runs no scripts and sends nothing.
    await ensure_auth_budget(request, 2);

    const context = await browser.newContext({ colorScheme: 'light', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const html = page.locator('html');
    const theme = page.getByRole('group', { name: 'Theme' });

    await page.goto('/login');
    // The form mounts after the session check, so by then the page has hydrated and the switch responds.
    await expect(page.locator('#login_username')).toBeVisible();
    await theme.getByRole('button', { name: 'Dark' }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(theme.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');

    // With the app's scripts blocked nothing hydrates, so only the inline pre-paint script can stamp the page.
    await page.route('**/_next/static/chunks/**', (route) => route.abort());
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await context.close();
  });

  test('the top bar keeps a pinned theme through a reload', async ({ desk, request }) => {
    test.slow();
    // Signing the desk in, if this worker has not yet, costs two; the reload restores the session once.
    await ensure_auth_budget(request, 3);

    const page = await desk.page('trader_a');
    await page.emulateMedia({ colorScheme: 'dark' });
    const html = page.locator('html');
    const theme = page.getByRole('group', { name: 'Theme' });

    await theme.getByRole('button', { name: 'Light' }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');

    await page.reload();
    await expect(page.locator('[role="grid"]')).toBeVisible();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(theme.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');

    // The desk page is shared with later tests, so it goes back to following the OS.
    await theme.getByRole('button', { name: 'System' }).click();
    await expect(html).not.toHaveAttribute('data-theme');
  });
});
