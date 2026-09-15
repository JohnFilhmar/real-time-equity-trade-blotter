import { expect, test } from './test-utils';

test.describe('filters below lg and the trade date range', () => {
  test('a tablet opens the filters in a panel, filters from it, and gets focus back on close', async ({ desk }) => {
    const page = await desk.page('trader_a');
    await page.setViewportSize({ width: 900, height: 900 });

    const open = page.getByRole('button', { name: /^Filters/ });
    await expect(open).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Filters' })).toBeHidden();

    await open.click();
    const panel = page.getByRole('dialog', { name: 'Filters' });
    await expect(panel).toBeVisible();

    await panel.getByRole('button', { name: 'SELL', exact: true }).click();
    await expect(page).toHaveURL(/side=SELL/);
    await expect(open).toHaveAccessibleName(/^Filters\s*1$/);

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(open).toBeFocused();
  });

  test('a phone reaches the same filters', async ({ desk }) => {
    const page = await desk.page('viewer');
    await page.setViewportSize({ width: 390, height: 844 });

    await page.getByRole('button', { name: /^Filters/ }).click();
    const panel = page.getByRole('dialog', { name: 'Filters' });
    await expect(panel.getByLabel('Symbol')).toBeVisible();
    await expect(panel.getByLabel('Trade date from (UTC)')).toBeVisible();

    await panel.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(panel).toHaveCount(0);
  });

  test('a From later than To stays in the rail with the reason, and never reaches the URL', async ({ desk }) => {
    const page = await desk.page('trader_a');
    const from = page.getByLabel('Trade date from (UTC)');
    const to = page.getByLabel('Trade date to (UTC)');

    await to.fill('2026-08-18T09:00');
    await expect(page).toHaveURL(/date_to=/);
    await expect(from).toHaveAttribute('max', '2026-08-18T09:00:00');

    await from.fill('2026-08-18T12:00');
    await expect(page.getByText('From must be on or before To')).toBeVisible();
    await expect(from).toHaveAttribute('aria-invalid', 'true');
    await expect(to).toHaveAttribute('min', '2026-08-18T12:00:00');
    await expect(page).not.toHaveURL(/date_from=/);

    await page.getByRole('button', { name: 'Remove To filter' }).click();
    await expect(page).not.toHaveURL(/date_to=/);
    await expect(page.getByText('From must be on or before To')).toHaveCount(0);
    await expect(from).toHaveValue('');
  });
});
