/**
 * Base of the trade API as the browser sees it: this web app's own origin.
 *
 * The web server forwards the API's paths over the internal network (see `next.config.ts`), so
 * every request and the socket are same-origin and the API's address never reaches the browser.
 * Empty rather than a URL, so a path such as `/api/v1/trades` is used as it is.
 */
export const api_url = '';
