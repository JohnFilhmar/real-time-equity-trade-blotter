/**
 * The localStorage key the theme choice persists under.
 *
 * Two readers need it: the theme provider, and the pre-paint script the root layout inlines into
 * every page. It lives in this plain module, not beside the provider, because the provider file is a
 * `'use client'` module. A Server Component such as the root layout that imports a value from a
 * client module receives a client reference instead of the value, so the inlined script would read
 * `localStorage.getItem(undefined)` and never find the stored choice before paint.
 */
export const theme_storage_key = 'blotter_theme';
