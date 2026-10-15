import type { Page } from '@playwright/test';
import { expect, test } from './test-utils';

/**
 * Starts recording whether the pill passes through `resyncing`, and resolves once the recorder is
 * in place.
 *
 * The resyncing state lasts only as long as the refetch it covers, tens of milliseconds on a local
 * stack, and the hub can reconnect within milliseconds of the network returning. So the observer
 * must be running before the network is restored: await this first, then go back online. It also
 * keeps old values, so a state that came and went before the callback ran still counts.
 *
 * @param page - The signed-in page.
 */
async function watch_for_resync(page: Page): Promise<void> {
  await page.locator('[role="status"][data-state]').evaluate((element) => {
    Reflect.set(window, 'saw_resync', false);
    const observer = new MutationObserver((records) => {
      const seen =
        element.getAttribute('data-state') === 'resyncing' || records.some((record) => record.oldValue === 'resyncing');
      if (seen) {
        Reflect.set(window, 'saw_resync', true);
        observer.disconnect();
      }
    });
    observer.observe(element, { attributes: true, attributeFilter: ['data-state'], attributeOldValue: true });
  });
}

/**
 * Reports what the recorder from {@link watch_for_resync} has seen so far.
 *
 * @param page - The signed-in page.
 * @returns Whether the pill has passed through `resyncing`.
 */
function saw_resync(page: Page): Promise<boolean> {
  return page.evaluate(() => Reflect.get(window, 'saw_resync') === true);
}

// The interface spec's feed-drop rules: when the link goes, the pill turns amber and says so and
// every mutation is blocked with a reason rather than queued; when the link returns, the client
// resyncs before it calls itself live again.
//
// Going offline at the browser is a silent outage: the open socket is not closed, frames simply
// stop, which is what a dropped desk link looks like. The client notices through the hub's
// keep-alive, so the amber pill arrives about 30 seconds after the drop (the server pings every
// 15 seconds and the client gives up on it after 30 without a message). That wait is the test's cost
// and the reason its timeout is longer than the suite's.
test.describe('feed drop and recovery @critical', () => {
  test('booking is blocked while the link is down, then the blotter resyncs and goes live again', async ({ desk }) => {
    test.setTimeout(150_000);

    const page = await desk.page('trader_a');
    const pill = page.locator('[role="status"][data-state]');
    const book = page.getByRole('button', { name: 'New trade' }).first();

    await expect(pill).toHaveAttribute('data-state', 'live');
    await expect(book).toBeEnabled();

    await page.context().setOffline(true);

    await expect(pill).toHaveAttribute('data-state', 'reconnecting', { timeout: 75_000 });
    await expect(pill).toContainText('RECONNECTING');
    await expect(book).toBeDisabled();
    await expect(book).toHaveAttribute('title', 'Link to the desk is down, reconnecting');

    await watch_for_resync(page);
    await page.context().setOffline(false);

    await expect.poll(() => saw_resync(page), { timeout: 15_000 }).toBe(true);
    await expect(pill).toHaveAttribute('data-state', 'live');
    await expect(pill).toContainText('LIVE');
    await expect(book).toBeEnabled();
  });
});
