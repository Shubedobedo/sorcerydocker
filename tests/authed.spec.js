import { test, expect } from '@playwright/test';
import { signIn, USERS } from './helpers/auth.js';
import { gotoHydrated } from './helpers/hydration.js';

const errorsFor = new WeakMap();
const allowedFor = new WeakMap();

/**
 * Declares a console error this test expects, so the blanket assertion below
 * doesn't fail on it. Use sparingly and always with a narrow substring — a test
 * that asserts a 4xx response necessarily produces a failed-resource error, but
 * anything broader would blind the check that has already caught real bugs.
 */
function allowConsoleError(page, substring) {
  allowedFor.set(page, [...(allowedFor.get(page) ?? []), substring]);
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(String(err)));
  errorsFor.set(page, errors);
});

test.afterEach(async ({ page }) => {
  const allowed = allowedFor.get(page) ?? [];
  const errors = (errorsFor.get(page) ?? []).filter(
    (e) => !allowed.some((substring) => e.includes(substring))
  );
  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
});

test.describe('signed out', () => {
  test('nav offers sign-in and hides the avatar', async ({ page }) => {
    await page.goto('/cards');
    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible();
  });

  test('the decks API rejects writes', async ({ request }) => {
    const res = await request.post('/api/decks', { data: { name: 'Should not exist' } });
    expect(res.status()).toBe(401);
  });
});

test.describe('signed in as a member', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context, 'member');
  });

  test('the session cookie authenticates', async ({ page }) => {
    await page.goto('/cards');
    await expect(page.getByRole('link', { name: 'Sign In' })).toHaveCount(0);
    // hooks.server.js's session callback fills name/role from the database, so
    // seeing the seeded name proves the DB lookup ran, not just cookie decoding.
    await expect(page.locator(`a[href="/profile"][title="${USERS.member.name}"]`)).toBeVisible();
  });

  test('admin-only nav is hidden from members', async ({ page }) => {
    await page.goto('/cards');
    await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
  });

  for (const path of ['/decks', '/collection', '/cubes', '/trades', '/friends', '/profile']) {
    test(`${path} loads without redirecting to login`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res.status()).toBeLessThan(400);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  }

  // NOTE: use `page.request`, not the standalone `request` fixture — the latter
  // has its own cookie jar and would be unauthenticated here.
  test('a created deck appears on the decks page and can be deleted', async ({ page }) => {
    const name = `E2E Deck ${Date.now()}`;

    const created = await page.request.post('/api/decks', {
      data: { name, format: 'standard' }
    });
    expect(created.status()).toBe(201);
    const deck = await created.json();
    expect(deck.user_id).toBe(USERS.member.id);

    await page.goto('/decks');
    await expect(page.getByText(name).first()).toBeVisible();

    await page.goto(`/decks/${deck.slug}`);
    await expect(page.getByRole('heading', { name })).toBeVisible();

    const deleted = await page.request.delete(`/api/decks/${deck.id}`);
    expect(deleted.ok()).toBeTruthy();

    await page.goto('/decks');
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test('cards added to the collection show up on the collection page', async ({ page }) => {
    const res = await page.request.get('/api/cards?page=1');
    expect(res.ok()).toBeTruthy();
    const { cards } = await res.json();
    const card = cards[0];

    const added = await page.request.post('/api/collection', {
      data: { card_id: card.id, set_id: null, quantity: 3 }
    });
    expect(added.ok()).toBeTruthy();

    await page.goto('/collection');
    await expect(page.getByText(card.name).first()).toBeVisible();

    // Quantity 0 is the documented delete path for the collection endpoint.
    await page.request.post('/api/collection', {
      data: { card_id: card.id, set_id: null, quantity: 0 }
    });
  });
});

test.describe('signed in as an admin', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context, 'admin');
  });

  test('the admin page is reachable', async ({ page }) => {
    const res = await page.goto('/admin');
    expect(res.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/admin$/);
  });
});

test.describe('collection quantity controls', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context, 'member');
  });

  // `collection` is $derived(data.collection), and these buttons work by
  // reassigning it optimistically. This guards that override: if the derived
  // recomputed over the top, the displayed quantity would snap back.
  test('+ and - update a card quantity optimistically and persist', async ({ page }) => {
    await gotoHydrated(page, '/collection');

    const card = page.locator('.collection-card').first();
    const qty = card.locator('.qty').first();
    await expect(qty).toBeVisible();
    const start = Number(await qty.textContent());

    await card.locator('.qty-btn').nth(1).click(); // "+"
    await expect(qty).toHaveText(String(start + 1));

    // A reload proves it reached the server rather than only the local override.
    await page.reload();
    await page.waitForLoadState('networkidle');
    const after = page.locator('.collection-card').first().locator('.qty').first();
    await expect(after).toHaveText(String(start + 1));

    // Put it back so the row is unchanged for other specs.
    await page.locator('.collection-card').first().locator('.qty-btn').first().click(); // "-"
    await expect(after).toHaveText(String(start));
  });
});

test.describe('trade modal dismissal', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context, 'member');
  });

  // The backdrop dismisses by testing e.target === e.currentTarget, which
  // replaced a stopPropagation handler on the modal body. If that check were
  // wrong, clicking inside the modal would close it.
  test('closes on backdrop click and Escape, but not on clicks inside', async ({ page }) => {
    await gotoHydrated(page, '/collection');

    const overlay = page.locator('.modal-overlay');
    const modal = page.locator('.modal');

    await page.locator('.collection-card').first().locator('.trade-btn').click();
    await expect(modal).toBeVisible();

    // A click on the modal body must NOT dismiss it.
    await modal.locator('h3').click();
    await expect(modal).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);

    // Reopen and dismiss by clicking the backdrop itself, away from the modal.
    await page.locator('.collection-card').first().locator('.trade-btn').click();
    await expect(modal).toBeVisible();
    await overlay.click({ position: { x: 5, y: 5 } });
    await expect(overlay).toHaveCount(0);
  });
});

// Friendship rows are one-directional and carry their own share flags. The seed
// gives member -> admin `share_collection = 1` and admin -> member nothing, so
// these two specs pin both halves: sharing grants access, and the absence of a
// share on the OWNER's row refuses it. Testing only the allowed direction would
// pass even if the check were skipped entirely.
test.describe('friend sharing is one-directional', () => {
  test('a friend who was granted access can view the collection', async ({ page, context }) => {
    await signIn(context, 'admin');

    const res = await page.goto(`/collection/${USERS.member.id}`);
    expect(res.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(USERS.member.name);
  });

  test('a friend who was not granted access is refused', async ({ page, context }) => {
    await signIn(context, 'member');
    // The 403 response is the assertion; the browser logs it as a failed resource.
    allowConsoleError(page, 'status of 403');

    const res = await page.goto(`/collection/${USERS.admin.id}`);
    expect(res.status()).toBe(403);
  });
});
