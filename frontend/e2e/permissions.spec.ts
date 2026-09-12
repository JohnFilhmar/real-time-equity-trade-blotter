import { book_trade, expect, open_trade, test } from './test-utils';

test.describe('permission-aware interface', () => {
  test('a viewer never sees the booking controls', async ({ desk }) => {
    const page = await desk.page('viewer');

    await expect(page.getByRole('button', { name: 'New trade' })).toHaveCount(0);

    await page.locator('[role="grid"] [role="row"][aria-rowindex="2"]').click();
    await expect(page.locator('aside[aria-label^="Trade TRD-"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Amend' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cancel trade' })).toHaveCount(0);
  });

  test('a trader sees another trader\'s trade greyed with the desk-head reason, and an admin does not', async ({ desk }) => {
    const owner = await desk.page('trader_b');
    const trade_id = await book_trade(owner, 900);

    const other = await desk.page('trader_a');
    await open_trade(other, trade_id);
    const amend = other.getByRole('button', { name: 'Amend' });
    await expect(amend).toBeDisabled();
    await expect(amend).toHaveAttribute('title', 'Booked by ABROWN, desk head only');

    const admin = await desk.page('admin');
    await open_trade(admin, trade_id);
    await expect(admin.getByRole('button', { name: 'Amend' })).toBeEnabled();
  });
});
