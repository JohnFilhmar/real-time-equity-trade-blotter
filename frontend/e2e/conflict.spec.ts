import { book_trade, expect, open_trade, test } from './test-utils';

// Optimistic concurrency, seen from the interface: the second person to save against the same
// version is refused with a 409, shown what moved, and never allowed to overwrite the first.
test.describe('concurrent amendment @critical', () => {
  test('the slower save is refused and shown the other desk\'s change', async ({ desk }) => {
    const first = await desk.page('admin');
    const second = await desk.page('trader_a');

    // The trader books, so both the trader and the desk head may amend it.
    const trade_id = await book_trade(second, 1300);
    await expect(first.locator(`[data-trade-id="${trade_id}"]`).first()).toBeVisible();

    // Both open the ticket on version 1.
    await open_trade(first, trade_id);
    await first.getByRole('button', { name: 'Amend' }).click();
    await open_trade(second, trade_id);
    await second.getByRole('button', { name: 'Amend' }).click();

    // The desk head saves first.
    const first_ticket = first.getByRole('dialog');
    await first_ticket.locator('#t_quantity').fill('1400');
    await first_ticket.getByRole('button', { name: 'Save amendment' }).click();
    await expect(first.getByText(`Amended ${trade_id}`)).toBeVisible();

    // The trader's ticket still carries version 1, so the save is a conflict, not an overwrite.
    const second_ticket = second.getByRole('dialog');
    await second_ticket.locator('#t_quantity').fill('1500');
    await second_ticket.getByRole('button', { name: 'Save amendment' }).click();
    await expect(second_ticket.getByText('Another desk changed this trade first.')).toBeVisible();
    await expect(second_ticket.getByText('Quantity 1,300 → 1,400')).toBeVisible();

    // The row on the trader's own screen already shows the desk head's value.
    await expect(second.locator(`[data-trade-id="${trade_id}"]`).first()).toContainText('1,400');
  });
});
