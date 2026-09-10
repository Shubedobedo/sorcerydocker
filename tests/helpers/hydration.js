/**
 * Navigates and waits until the page is interactive.
 *
 * Every control in this app is JS-driven — buttons with `onclick`, inputs with
 * `onkeydown`, no <form> and no `action` anywhere — so clicking or typing before
 * hydration completes does nothing at all, silently: no handler runs, no request
 * is made, and no error is logged. Tests that skip this wait fail in a way that
 * looks like a broken feature rather than a race.
 *
 * `networkidle` is the proxy for "the module graph has finished loading and
 * hydration has run". It is heavier than an element wait, but there is no
 * app-level DOM signal for hydration here, and pinning to a Svelte internal
 * like `window.__svelte` would be worse.
 */
export async function gotoHydrated(page, path) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}
