import { test, expect } from '@playwright/test';
import { signIn, USERS } from './helpers/auth.js';

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
