import type { Page } from '@playwright/test';
import { expect, test } from './test-utils';

/**
 * Resolves once the pill has shown `resyncing`, or with `false` if it has not within the window.
 *
 * The resyncing state lasts only as long as the refetch it covers, which on a local stack is well
 * under a second, so a polling assertion can miss it. An observer installed before the link
 * returns cannot.
 *
 * @param page - The signed-in page.
 * @returns Whether the pill passed through `resyncing`.
 */
function watch_for_resync(page: Page): Promise<boolean> {
  return page.locator('[role="status"][data-state]').evaluate(
    (element) =>
      new Promise<boolean>((resolve) => {
        const observer = new MutationObserver(() => {
          if (element.getAttribute('data-state') === 'resyncing') {
            observer.disconnect();
            resolve(true);
          }
        });
        observer.observe(element, { attributes: true, attributeFilter: ['data-state'] });
        setTimeout(() => {
          observer.disconnect();
          resolve(false);
        }, 15_000);
      }),
  );
}

// The interface spec's feed-drop rules: when the link goes, the pill turns amber and says so and
// every mutation is blocked with a reason rather than queued; when the link returns, the client
// resyncs before it calls itself live again.
//
// Going offline at the browser is a silent outage: the open socket is not closed, frames simply
// stop, which is what a dropped desk link looks like. The client notices through the socket
// heartbeat, so the amber pill arrives about 45 seconds after the drop (the server pings every
// 25 seconds and allows 20 more before a peer is considered gone). That wait is the test's cost
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

    const saw_resync = watch_for_resync(page);
    await page.context().setOffline(false);

    expect(await saw_resync).toBe(true);
    await expect(pill).toHaveAttribute('data-state', 'live');
    await expect(pill).toContainText('LIVE');
    await expect(book).toBeEnabled();
  });
});
