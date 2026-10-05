import { test, expect } from '@playwright/test';
import { signIn, USERS } from './helpers/auth.js';
import { AVATARS, CUBE } from './helpers/fixtures.js';
import { gotoHydrated } from './helpers/hydration.js';

/**
 * Read-only API keys: minted on /profile (session only), used against /api/v1/*
 * (key only). The standalone `request` fixture has its own empty cookie jar, so
 * it is how these tests call /api/v1 as a bot would — with a key and no session.
 * `page.request` / `ctx.request` carry the signed-in session and are used for
 * the session-only management routes.
 */

test.describe.configure({ mode: 'serial' });

const errorsFor = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(String(err)));
  errorsFor.set(page, errors);
});

test.afterEach(async ({ page }) => {
  const errors = errorsFor.get(page) ?? [];
  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
});

/** A fresh browser context signed in as one of the seeded users. */
async function newContextAs(browser, who) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  await signIn(ctx, who);
  return ctx;
}

/** Mints a key through the session-only management API and returns the full key. */
async function createKey(ctx, name = 'e2e bot') {
  const res = await ctx.request.post('/api/keys', { data: { name } });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  expect(body.key).toMatch(/^sk_[A-Za-z0-9_-]{43}$/);
  return body.key;
}

const bearer = (key) => ({ Authorization: `Bearer ${key}` });

// Each test mints its own keys. Revoke them all afterwards so no user drifts
// toward the 10-key cap and no test sees another test's keys.
test.afterEach(async ({ browser }) => {
  for (const who of ['member', 'admin']) {
    const ctx = await newContextAs(browser, who);
    const res = await ctx.request.get('/api/keys');
    if (res.ok()) {
      for (const k of (await res.json()).keys) await ctx.request.delete(`/api/keys/${k.id}`);
    }
    await ctx.close();
  }
});

test.describe('key management (session only)', () => {
  test('create, list without the secret, revoke', async ({ browser, request }) => {
    const ctx = await newContextAs(browser, 'member');
    const key = await createKey(ctx, 'list me');

    const list = await (await ctx.request.get('/api/keys')).json();
    const row = list.keys.find((k) => k.name === 'list me');
    expect(row).toBeTruthy();
    expect(row.prefix).toBe(key.slice(0, 8));
    expect(row).not.toHaveProperty('key');
    expect(row).not.toHaveProperty('key_hash');
    expect(JSON.stringify(list)).not.toContain(key);

    expect((await request.get('/api/v1/me', { headers: bearer(key) })).status()).toBe(200);

    const del = await ctx.request.delete(`/api/keys/${row.id}`);
    expect(del.status()).toBe(200);
    expect((await request.get('/api/v1/me', { headers: bearer(key) })).status()).toBe(401);
    await ctx.close();
  });

  test('rejects bad names and an 11th key', async ({ browser }) => {
    const ctx = await newContextAs(browser, 'admin');
    for (const name of ['', '   ', 'x'.repeat(51), undefined, 42]) {
      const res = await ctx.request.post('/api/keys', { data: { name } });
      expect(res.status(), `name=${JSON.stringify(name)}`).toBe(400);
      expect((await res.json()).error).toMatch(/name/i);
    }

    const existing = (await (await ctx.request.get('/api/keys')).json()).keys.length;
    for (let i = existing; i < 10; i++) await createKey(ctx, `fill ${i}`);
    const res = await ctx.request.post('/api/keys', { data: { name: 'one too many' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/10/);
    await ctx.close();
  });

  test('signed out cannot list or create', async ({ request }) => {
    expect((await request.get('/api/keys')).status()).toBe(401);
    expect((await request.post('/api/keys', { data: { name: 'x' } })).status()).toBe(401);
  });

  test('a key cannot manage keys', async ({ browser, request }) => {
    const ctx = await newContextAs(browser, 'member');
    const key = await createKey(ctx);
    const create = await request.post('/api/keys', { headers: bearer(key), data: { name: 'x' } });
    expect(create.status()).toBe(401);
    expect((await request.get('/api/keys', { headers: bearer(key) })).status()).toBe(401);
    await ctx.close();
  });

  test("cannot revoke another user's key", async ({ browser, request }) => {
    const admin = await newContextAs(browser, 'admin');
    const adminKey = await createKey(admin, 'admin bot');
    const adminRow = (await (await admin.request.get('/api/keys')).json()).keys.find(
      (k) => k.name === 'admin bot'
    );

    const member = await newContextAs(browser, 'member');
    expect((await member.request.delete(`/api/keys/${adminRow.id}`)).status()).toBe(404);
    expect((await member.request.delete('/api/keys/not-a-number')).status()).toBe(404);
    expect((await request.get('/api/v1/me', { headers: bearer(adminKey) })).status()).toBe(200);

    await admin.close();
    await member.close();
  });
});

test.describe('key auth on /api/v1', () => {
  test('/me identifies the owner and never leaks email', async ({ browser, request }) => {
    const ctx = await newContextAs(browser, 'member');
    const key = await createKey(ctx);
    const res = await request.get('/api/v1/me', { headers: bearer(key) });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ id: USERS.member.id, name: USERS.member.name });
    await ctx.close();
  });

  test('missing, malformed, unknown keys are 401 JSON', async ({ request }) => {
    for (const headers of [
      {},
      { Authorization: 'sk_nobearer' },
      { Authorization: 'Basic abc' },
      { Authorization: 'Bearer ' },
      { Authorization: 'Bearer sk_' + 'A'.repeat(43) }
    ]) {
      const res = await request.get('/api/v1/me', { headers });
      expect(res.status(), JSON.stringify(headers)).toBe(401);
      expect(await res.json()).toEqual({ error: 'Invalid or missing API key' });
    }
  });

  test('a session cookie alone is not accepted', async ({ page }) => {
    await signIn(page.context(), 'member');
    expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  });

  test('lowercase scheme and extra whitespace still authenticate', async ({ browser, request }) => {
    const ctx = await newContextAs(browser, 'member');
    const key = await createKey(ctx);
    const res = await request.get('/api/v1/me', {
      headers: { Authorization: `bearer   ${key}  ` }
    });
    expect(res.status()).toBe(200);
    await ctx.close();
  });

  test("the key's owner wins over a different user's session", async ({ browser }) => {
    const admin = await newContextAs(browser, 'admin');
    const adminKey = await createKey(admin);
    const member = await newContextAs(browser, 'member');
    const res = await member.request.get('/api/v1/me', { headers: bearer(adminKey) });
    expect((await res.json()).id).toBe(USERS.admin.id);
    await admin.close();
    await member.close();
  });

  test('last used is recorded', async ({ browser, request }) => {
    const ctx = await newContextAs(browser, 'member');
    const key = await createKey(ctx, 'track usage');
    const before = (await (await ctx.request.get('/api/keys')).json()).keys.find(
      (k) => k.name === 'track usage'
    );
    expect(before.last_used_at).toBeNull();
    await request.get('/api/v1/me', { headers: bearer(key) });
    const after = (await (await ctx.request.get('/api/keys')).json()).keys.find(
      (k) => k.name === 'track usage'
    );
    expect(after.last_used_at).not.toBeNull();
    await ctx.close();
  });
});

const isPrice = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));

test.describe('/api/v1 data', () => {
  test('collection returns the owner rows with prices', async ({ browser, request }) => {
    const ctx = await newContextAs(browser, 'member');
    const key = await createKey(ctx);

    const res = await request.get('/api/v1/collection', { headers: bearer(key) });
    expect(res.status()).toBe(200);
    const { cards } = await res.json();

    // The seed gives the member ~700 collection rows; compare against the
    // existing session API rather than hardcoding a count.
    const viaSession = await (await ctx.request.get('/api/collection')).json();
    expect(cards.length).toBe(viaSession.length);
    expect(cards.length).toBeGreaterThan(0);

    for (const c of cards) {
      expect(Object.keys(c).sort()).toEqual(
        ['card_id', 'market_price', 'name', 'quantity', 'set_id', 'set_name'].sort()
      );
      expect(typeof c.name).toBe('string');
      expect(isPrice(c.market_price), `${c.card_id} ${c.market_price}`).toBe(true);
    }
    await ctx.close();
  });

  test('collection is empty for a user with none, not someone else’s', async ({
    browser,
    request
  }) => {
    const ctx = await newContextAs(browser, 'admin');
    const key = await createKey(ctx);
    const { cards } = await (
      await request.get('/api/v1/collection', { headers: bearer(key) })
    ).json();
    expect(cards).toEqual([]);
    await ctx.close();
  });

  test('trades lists only available entries, with prices', async ({ browser, request }) => {
    const ctx = await newContextAs(browser, 'member');
    const key = await createKey(ctx);
    const SET_NAME = 'E2E API Trades';

    const keep = await (
      await ctx.request.post('/api/trades', {
        data: { card_id: 'battlemage', set_name: SET_NAME, quantity: 2, foil: true }
      })
    ).json();
    const gone = await (
      await ctx.request.post('/api/trades', {
        data: { card_id: 'sorcerer', set_name: SET_NAME, quantity: 1 }
      })
    ).json();
    // trade-list.spec.js runs after this file against the same member binder and
    // expects exactly one Battlemage entry, so these rows must not outlive the test.
    try {
      const patch = await ctx.request.patch('/api/trades', {
        data: { id: gone.id, status: 'archived' }
      });
      expect(patch.ok()).toBeTruthy();

      const res = await request.get('/api/v1/trades', { headers: bearer(key) });
      expect(res.status()).toBe(200);
      const mine = (await res.json()).trades.filter((t) => t.set_name === SET_NAME);

      expect(mine.map((t) => t.id)).toEqual([keep.id]);
      const [t] = mine;
      expect(Object.keys(t).sort()).toEqual(
        [
          'card_id',
          'expected_value',
          'foil',
          'id',
          'list_quantity',
          'location',
          'market_price',
          'name',
          'quantity',
          'set_name'
        ].sort()
      );
      expect(t).toMatchObject({ card_id: 'battlemage', name: 'Battlemage', quantity: 2, foil: 1 });
      expect(isPrice(t.market_price)).toBe(true);
    } finally {
      for (const id of [keep.id, gone.id]) {
        await ctx.request.delete('/api/trades', { data: { id } });
      }
      await ctx.close();
    }
  });
});

test.describe('/api/v1 decks and cubes', () => {
  test('deck list and detail, with avatar split out and prices', async ({ browser, request }) => {
    const ctx = await newContextAs(browser, 'member');
    const key = await createKey(ctx);

    const deck = await (
      await ctx.request.post('/api/decks', { data: { name: 'E2E API Deck', tags: ['Fire'] } })
    ).json();
    const avatar = await ctx.request.post(`/api/decks/${deck.id}/cards`, {
      data: { card_id: AVATARS.inPool, zone: 'avatar' }
    });
    expect(avatar.ok()).toBeTruthy();
    const spell = await ctx.request.post(`/api/decks/${deck.id}/cards`, {
      data: { card_id: AVATARS.outOfPool, zone: 'spellbook', quantity: 2 }
    });
    expect(spell.ok()).toBeTruthy();

    const list = await (await request.get('/api/v1/decks', { headers: bearer(key) })).json();
    const summary = list.decks.find((d) => d.id === deck.id);
    expect(summary).toEqual({
      id: deck.id,
      name: 'E2E API Deck',
      format: 'standard',
      visibility: 'private',
      tags: ['Fire'],
      cube_id: null,
      card_count: 2, // the avatar does not count
      updated_at: expect.any(String)
    });

    const res = await request.get(`/api/v1/decks/${deck.id}`, { headers: bearer(key) });
    expect(res.status()).toBe(200);
    const detail = await res.json();
    expect(detail).toMatchObject({ ...summary, updated_at: expect.any(String) });
    expect(detail.avatar).toEqual({
      card_id: AVATARS.inPool,
      name: 'Battlemage',
      market_price: detail.avatar.market_price
    });
    expect(isPrice(detail.avatar.market_price)).toBe(true);
    expect(detail.atlas).toEqual([]);
    expect(detail.spellbook).toHaveLength(1);
    expect(detail.spellbook[0]).toMatchObject({ card_id: AVATARS.outOfPool, quantity: 2 });
    expect(Object.keys(detail.spellbook[0]).sort()).toEqual(
      ['card_id', 'market_price', 'name', 'quantity'].sort()
    );
    expect(isPrice(detail.spellbook[0].market_price)).toBe(true);
    await ctx.close();
  });

  test('an empty deck has a null avatar and empty zones', async ({ browser, request }) => {
    const ctx = await newContextAs(browser, 'member');
    const key = await createKey(ctx);
    const deck = await (
      await ctx.request.post('/api/decks', { data: { name: 'E2E Empty API Deck' } })
    ).json();

    const detail = await (
      await request.get(`/api/v1/decks/${deck.id}`, { headers: bearer(key) })
    ).json();
    expect(detail).toMatchObject({
      card_count: 0,
      tags: [],
      avatar: null,
      atlas: [],
      spellbook: []
    });
    await ctx.close();
  });

  test('cube list and detail', async ({ browser, request }) => {
    const ctx = await newContextAs(browser, 'member');
    const key = await createKey(ctx);

    const list = await (await request.get('/api/v1/cubes', { headers: bearer(key) })).json();
    const summary = list.cubes.find((c) => c.id === CUBE.id);
    expect(Object.keys(summary).sort()).toEqual(
      ['card_count', 'id', 'name', 'updated_at', 'visibility'].sort()
    );
    expect(summary.name).toBe(CUBE.name);

    const detail = await (
      await request.get(`/api/v1/cubes/${CUBE.id}`, { headers: bearer(key) })
    ).json();
    expect(detail.cards.length).toBeGreaterThan(0);
    expect(detail.cards.some((c) => c.card_id === AVATARS.inPool)).toBe(true);
    expect(detail.card_count).toBe(detail.cards.reduce((n, c) => n + c.quantity, 0));
    for (const c of detail.cards) {
      expect(Object.keys(c).sort()).toEqual(['card_id', 'market_price', 'name', 'quantity'].sort());
      expect(isPrice(c.market_price)).toBe(true);
    }
    await ctx.close();
  });

  test("another user's deck and cube are 404, even when public", async ({ browser, request }) => {
    const admin = await newContextAs(browser, 'admin');
    const deck = await (
      await admin.request.post('/api/decks', { data: { name: 'Admin Public Deck' } })
    ).json();
    await admin.request.patch(`/api/decks/${deck.id}`, { data: { visibility: 'public' } });
    const cube = await (
      await admin.request.post('/api/cubes', { data: { name: 'Admin Cube' } })
    ).json();

    const member = await newContextAs(browser, 'member');
    const key = await createKey(member);
    for (const path of [`/api/v1/decks/${deck.id}`, `/api/v1/cubes/${cube.id}`]) {
      const res = await request.get(path, { headers: bearer(key) });
      expect(res.status(), path).toBe(404);
      expect((await res.json()).error).toMatch(/not found/);
    }
    const decks = (await (await request.get('/api/v1/decks', { headers: bearer(key) })).json())
      .decks;
    expect(decks.some((d) => d.id === deck.id)).toBe(false);
    const cubes = (await (await request.get('/api/v1/cubes', { headers: bearer(key) })).json())
      .cubes;
    expect(cubes.some((c) => c.id === cube.id)).toBe(false);

    await admin.close();
    await member.close();
  });

  test('non-numeric ids are 404 JSON', async ({ browser, request }) => {
    const ctx = await newContextAs(browser, 'member');
    const key = await createKey(ctx);
    for (const path of ['/api/v1/decks/abc', '/api/v1/cubes/1.5', '/api/v1/decks/-1']) {
      const res = await request.get(path, { headers: bearer(key) });
      expect(res.status(), path).toBe(404);
      expect(await res.json()).toHaveProperty('error');
    }
    await ctx.close();
  });

  test('writes are 405 even with a valid key', async ({ browser, request }) => {
    const ctx = await newContextAs(browser, 'member');
    const key = await createKey(ctx);
    const path = `/api/v1/decks/1`;
    expect((await request.post(path, { headers: bearer(key), data: {} })).status()).toBe(405);
    expect((await request.delete(path, { headers: bearer(key) })).status()).toBe(405);
    expect(
      (await request.patch('/api/v1/collection', { headers: bearer(key), data: {} })).status()
    ).toBe(405);
    await ctx.close();
  });

  test('every /api/v1 route rejects a missing key', async ({ request }) => {
    for (const path of [
      '/api/v1/collection',
      '/api/v1/trades',
      '/api/v1/decks',
      '/api/v1/decks/1',
      '/api/v1/cubes',
      `/api/v1/cubes/${CUBE.id}`
    ]) {
      expect((await request.get(path)).status(), path).toBe(401);
    }
  });
});

test.describe('/profile API keys UI', () => {
  test('create shows the key once, revoke removes it', async ({ page, request }) => {
    await signIn(page.context(), 'member');
    await gotoHydrated(page, '/profile');

    await page.getByLabel('Key name').fill('UI bot');
    await page.getByRole('button', { name: 'Create key' }).click();

    const shown = page.locator('code.new-key');
    await expect(shown).toHaveText(/^sk_[A-Za-z0-9_-]{43}$/);
    const key = (await shown.textContent()).trim();

    const me = await request.get('/api/v1/me', { headers: bearer(key) });
    expect(me.status()).toBe(200);

    const row = page.locator('li.api-key', { hasText: 'UI bot' });
    await expect(row).toContainText(key.slice(0, 8));
    await expect(row).toContainText('Never');

    // Shown once: a reload must not bring the full key back.
    await gotoHydrated(page, '/profile');
    await expect(page.locator('code.new-key')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(key);

    page.once('dialog', (d) => d.accept());
    await page
      .locator('li.api-key', { hasText: 'UI bot' })
      .getByRole('button', { name: 'Revoke' })
      .click();
    await expect(page.locator('li.api-key', { hasText: 'UI bot' })).toHaveCount(0);
    expect((await request.get('/api/v1/me', { headers: bearer(key) })).status()).toBe(401);
  });

  test('Copy says so when the clipboard is unavailable', async ({ page }) => {
    // No clipboard permission is granted here, so writeText rejects — the same
    // thing that happens on a plain-http self-hosted install, where
    // navigator.clipboard does not exist at all. The key is shown only once, so
    // a silent failure would leave the user believing they had copied it.
    await signIn(page.context(), 'member');
    await gotoHydrated(page, '/profile');
    await page.getByLabel('Key name').fill('copy bot');
    await page.getByRole('button', { name: 'Create key' }).click();
    await expect(page.locator('code.new-key')).toBeVisible();

    await page.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(page.locator('.toast')).toContainText('Copy failed');
  });

  test('Create key with no name says why instead of doing nothing', async ({ page }) => {
    // The app has no disabled-button styling, so a disabled Create key looked
    // clickable and silently ignored the click. It must stay clickable and explain.
    await signIn(page.context(), 'member');
    await gotoHydrated(page, '/profile');
    const button = page.getByRole('button', { name: 'Create key' });
    const before = await page.locator('li.api-key').count();

    for (const name of ['', '   ']) {
      await page.getByLabel('Key name').fill(name);
      await button.click({ timeout: 5000 });
      await expect(page.locator('.toast')).toContainText('Give the key a name first');
    }
    // Rejected client-side: no request, so no key and no 400 in the console.
    await expect(page.locator('li.api-key')).toHaveCount(before);
    await expect(page.locator('code.new-key')).toHaveCount(0);
  });
});
