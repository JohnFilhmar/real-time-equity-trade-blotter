import { book_trade, expect, open_trade, test } from './test-utils';

// The brief's literal acceptance criterion: a change made by one client is visible to every other
// connected client without a page refresh. Two browser contexts, two people, two sockets.
test.describe('live sync between two clients @critical', () => {
  test('a trade booked by one trader appears on the other trader\'s blotter, then follows its amend and cancel', async ({ desk }) => {
    const a = await desk.page('trader_a');
    const b = await desk.page('trader_b');

    const trade_id = await book_trade(a, 1700);

    // B never reloads. The row arrives over B's socket and is inserted at the top of the list.
    const row_on_b = b.locator(`[data-trade-id="${trade_id}"]`).first();
    await expect(row_on_b).toBeVisible();
    await expect(row_on_b).toContainText('1,700');

    // A amends the quantity; B sees the new quantity and the version pill without a refresh.
    await open_trade(a, trade_id);
    await a.getByRole('button', { name: 'Amend' }).click();
    const ticket = a.getByRole('dialog');
    // The counterparty is fixed once booked, so the amend ticket shows it locked with the way out.
    await expect(ticket.locator('#t_counterparty')).toBeDisabled();
    await expect(ticket.getByText('Fixed on an amendment. Cancel and rebook to change it.')).toBeVisible();
    await ticket.locator('#t_quantity').fill('2500');
    await ticket.getByRole('button', { name: 'Save amendment' }).click();
    await expect(a.getByText(`Amended ${trade_id}`)).toBeVisible();

    await expect(row_on_b).toContainText('2,500');
    await expect(row_on_b).toContainText('v2');

    // A cancels; B sees the status flip.
    await a.getByRole('button', { name: 'Cancel trade' }).click();
    const confirm = a.getByRole('dialog');
    await confirm.getByRole('button', { name: 'Cancel trade' }).click();
    await expect(a.getByText(`Cancelled ${trade_id}`)).toBeVisible();

    await expect(row_on_b).toContainText('CANCELLED');
  });
});
