import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import { signIn } from './helpers/auth.js';

/**
 * The cube generator end to end: what POST /api/cubes/:id/generate stores and
 * returns, and (further down) the edit page controls. The balancing rules
 * themselves are unit-tested in cube-pool.spec.js.
 *
 * Saved settings and the catalog are read straight from the test database
 * (read-only), because no API returns a cube's settings or a card's elements.
 */

test.describe.configure({ mode: 'serial' });

const BASICS = ['spire', 'stream', 'valley', 'wasteland'];
const ORDINARY_ONLY = {
  Ordinary: { enabled: true, max: 2 }, // the custom max must be ignored with copies off
  Exceptional: { enabled: false, max: 3 },
  Elite: { enabled: false, max: 2 },
  Unique: { enabled: false, max: 1 }
};

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

function withDb(fn) {
  const db = new Database('data/e2e.db', { readonly: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function savedSettings(cubeId) {
  return withDb((db) =>
    JSON.parse(db.prepare('SELECT settings FROM cubes WHERE id = ?').get(cubeId).settings)
  );
}

function colourlessIds() {
  return withDb(
    (db) =>
      new Set(
        db
          .prepare(`SELECT id FROM cards WHERE elements IS NULL OR elements IN ('[]', '["None"]')`)
          .all()
          .map((r) => r.id)
      )
  );
}

/** Creates a cube with these settings, generates it, and lists the pool. */
async function generate(page, name, settings) {
  const cube = await (await page.request.post('/api/cubes', { data: { name } })).json();
  const patch = await page.request.patch(`/api/cubes/${cube.id}`, { data: { settings } });
  expect(patch.ok()).toBeTruthy();
  const gen = await page.request.post(`/api/cubes/${cube.id}/generate`, { data: {} });
  expect(gen.ok(), await gen.text()).toBeTruthy();
  const res = await gen.json();

  const key = (await (await page.request.post('/api/keys', { data: { name } })).json()).key;
  const detail = await (
    await page.request.get(`/api/v1/cubes/${cube.id}`, {
      headers: { Authorization: `Bearer ${key}` }
    })
  ).json();
  for (const k of (await (await page.request.get('/api/keys')).json()).keys) {
    await page.request.delete(`/api/keys/${k.id}`);
  }
  const qty = Object.fromEntries(detail.cards.map((c) => [c.card_id, c.quantity]));
  return { ...cube, res, qty };
}

test.describe('generate endpoint', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page.context(), 'member');
  });

  test('an Air-only cube still includes colourless cards', async ({ page }) => {
    const cube = await generate(page, 'E2E Air Colourless', { elements: ['Air'], cubeSize: 120 });
    const colourless = colourlessIds();
    const inPool = Object.keys(cube.qty).filter((id) => colourless.has(id));
    expect(inPool.length).toBeGreaterThan(0);
    expect(Object.keys(cube.res.elementCounts.spells)).toEqual(['Air']);
    expect(cube.res.poolSize).toBe(120);
  });

  test('copies off: standard counts, overshoot saved as the new size', async ({ page }) => {
    const cube = await generate(page, 'E2E Copies Off', {
      cubeSize: 30,
      randomizeCopies: false,
      rarities: ORDINARY_ONLY
    });
    // Every card is an Ordinary at 4 copies: 28 is short, so the 8th card makes 32.
    expect(cube.res).toMatchObject({ success: true, poolSize: 32, cubeSize: 32, warning: null });
    expect(cube.res.notes[0]).toBe(
      'Pool is 32 (was 30): cube size rounded up to fit the last card at full copies.'
    );
    for (const [id, q] of Object.entries(cube.qty)) {
      if (!BASICS.includes(id)) expect(q, id).toBe(4);
    }
    expect(savedSettings(cube.id).cubeSize).toBe(32);
    expect(savedSettings(cube.id).randomizeCopies).toBe(false);
  });

  test('settings without the new keys keep the old behaviour', async ({ page }) => {
    const cube = await generate(page, 'E2E Old Settings', { cubeSize: 101 });
    expect(cube.res.poolSize).toBe(101); // copies on never overshoots
    expect(cube.res.cubeSize).toBe(101);
    expect(cube.res.notes).toEqual([]);
    expect(savedSettings(cube.id).cubeSize).toBe(101);
    expect(Object.keys(cube.res.elementCounts.sites)).toEqual(['Air', 'Earth', 'Fire', 'Water']);
  });

  test('basic sites are still added and still outside the size', async ({ page }) => {
    const cube = await generate(page, 'E2E Basics Still', {
      elements: ['Water'],
      cubeSize: 60,
      randomizeCopies: false,
      rarities: ORDINARY_ONLY
    });
    expect(cube.qty.stream).toBe(30);
    const nonBasic = Object.entries(cube.qty)
      .filter(([id]) => !BASICS.includes(id))
      .reduce((n, [, q]) => n + q, 0);
    expect(nonBasic).toBe(cube.res.poolSize);
  });
});
