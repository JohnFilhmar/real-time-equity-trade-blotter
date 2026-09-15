import type { Page } from '@playwright/test';
import { expect, test } from './test-utils';

/**
 * Reads the business id of the grid row that holds DOM focus.
 *
 * Read fresh at every step rather than predicted, because the live desk can insert a row above the
 * focused one at any moment.
 *
 * @param page - A signed-in page on the blotter.
 * @returns The focused row's trade id.
 */
async function focused_trade_id(page: Page): Promise<string> {
  const id = await page.locator('[role="grid"] [role="row"]:focus').getAttribute('data-trade-id');
  if (id === null) {
    throw new Error('No grid row holds focus');
  }
  return id;
}

// U-M12: one tab stop for the grid, the detail panel follows the focused row, and closing the panel
// leaves focus on that row.
test.describe('keyboard use of the blotter', () => {
  test('skips to the trades, follows the arrows with the panel open, and keeps focus on the row', async ({ desk }) => {
    const page = await desk.page('trader_a');

    const skip = page.getByRole('link', { name: 'Skip to trades' });
    await skip.focus();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('[role="grid"] [role="row"]:focus')).toHaveCount(1);

    await page.keyboard.press('Enter');
    const opened = await focused_trade_id(page);
    await expect(page.locator(`aside[aria-label="Trade ${opened}"]`)).toBeVisible();
    await expect(page.locator(`[role="grid"] [data-trade-id="${opened}"]`)).toBeFocused();

    await page.keyboard.press('ArrowDown');
    const followed = await focused_trade_id(page);
    expect(followed).not.toBe(opened);
    await expect(page.locator(`aside[aria-label="Trade ${followed}"]`)).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Close detail' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('aside[aria-label^="Trade TRD-"]')).toHaveCount(0);
    await expect(page.locator(`[role="grid"] [data-trade-id="${followed}"]`)).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator(`aside[aria-label="Trade ${followed}"]`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('aside[aria-label^="Trade TRD-"]')).toHaveCount(0);
    await expect(page.locator(`[role="grid"] [data-trade-id="${followed}"]`)).toBeFocused();
  });

  test('clicking a row gives it the tab stop, so the arrows continue from there', async ({ desk }) => {
    const page = await desk.page('viewer');

    await page.locator('[role="grid"] [role="row"][aria-rowindex="4"]').click();
    const clicked = await focused_trade_id(page);
    await expect(page.locator(`[role="grid"] [data-trade-id="${clicked}"]`)).toHaveAttribute('tabindex', '0');

    await page.keyboard.press('ArrowDown');
    expect(await focused_trade_id(page)).not.toBe(clicked);
    await expect(page.locator('aside[aria-label^="Trade TRD-"]')).toBeVisible();
  });
});
