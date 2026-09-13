import { expect, test } from './test-utils';

test.describe('blotter basics @smoke', () => {
  test('renders the grid, sorts and filters through the URL, and refreshes from the API', async ({ desk }) => {
    const page = await desk.page('trader_a');

    const rows = page.locator('[role="grid"] [role="row"][aria-rowindex]');
    await expect(rows.nth(1)).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(5);

    // Sort by quantity: the header carries aria-sort and the URL carries the sort, so the view is linkable.
    await page.getByRole('button', { name: /^Quantity/ }).click();
    await expect(page.locator('[role="columnheader"][aria-sort="ascending"]')).toContainText('Quantity');
    await expect(page).toHaveURL(/sort_by=quantity/);
    await expect(rows.nth(1)).toBeVisible();

    const quantities = await page
      .locator('[role="grid"] [role="row"][aria-rowindex] [role="gridcell"]:nth-child(4)')
      .allTextContents();
    const numbers = quantities.slice(0, 10).map((text) => Number(text.replace(/,/g, '')));
    expect(numbers).toEqual([...numbers].sort((left, right) => left - right));

    // Filter side SELL: every rendered side cell reads SELL and a chip appears.
    await page.getByRole('button', { name: 'SELL', exact: true }).first().click();
    await expect(page).toHaveURL(/side=SELL/);
    await expect(page.getByRole('button', { name: 'Remove Side filter' })).toBeVisible();
    await expect
      .poll(async () => {
        const sides = await page.locator('[role="grid"] [role="row"][aria-rowindex] [role="gridcell"]:nth-child(3)').allTextContents();
        return sides.length > 0 && sides.every((side) => side.trim() === 'SELL');
      })
      .toBe(true);

    // Refresh re-reads from the API and the grid stays populated.
    await page.getByRole('button', { name: 'Refresh from the API' }).click();
    await expect(rows.nth(1)).toBeVisible();

    // Clear filters returns to the default view.
    await page.getByRole('button', { name: /^Clear \d+$/ }).click();
    await expect(page).not.toHaveURL(/side=/);
  });

  test('the phone layout shows cards and the tab bar', async ({ desk }) => {
    const page = await desk.page('viewer');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('list', { name: 'Trade blotter' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Sections' }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Book a new trade' })).toHaveCount(0);
  });

  test('positions and the audit trail render from the API', async ({ desk }) => {
    const page = await desk.page('viewer');
    await page.getByRole('link', { name: 'Positions' }).first().click();
    await expect(page.getByRole('columnheader', { name: 'Unrealised' })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();

    await page.getByRole('link', { name: 'Audit trail' }).first().click();
    await expect(page.getByText('Amendments')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Open TRD-/ }).first()).toBeVisible();
  });
});
