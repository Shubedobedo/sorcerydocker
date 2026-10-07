import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth.js';
import { gotoHydrated } from './helpers/hydration.js';

/**
 * Cube generation adds each element's basic site — any number of copies is
 * legal — at 30 copies, after the random draw, for every element the cube
 * allows. Basics never count toward the cube size and never go into packs.
 */

test.describe.configure({ mode: 'serial' });

const BASICS = { Air: 'spire', Water: 'stream', Earth: 'valley', Fire: 'wasteland' };
const BASIC_IDS = Object.values(BASICS);

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

/** Creates a cube with these settings, generates it, and returns its id, slug and pool. */
async function generateCube(page, name, settings) {
  const cube = await (await page.request.post('/api/cubes', { data: { name } })).json();
  const patch = await page.request.patch(`/api/cubes/${cube.id}`, { data: { settings } });
  expect(patch.ok()).toBeTruthy();
  const gen = await page.request.post(`/api/cubes/${cube.id}/generate`, { data: {} });
  expect(gen.ok(), await gen.text()).toBeTruthy();
  const result = await gen.json();

  // The pool is only listed by the read-only API, which takes a key.
  const key = (await (await page.request.post('/api/keys', { data: { name } })).json()).key;
  const headers = { Authorization: `Bearer ${key}` };
  const detail = await (await page.request.get(`/api/v1/cubes/${cube.id}`, { headers })).json();
  const keys = (await (await page.request.get('/api/keys')).json()).keys;
  for (const k of keys) await page.request.delete(`/api/keys/${k.id}`);

  const qty = Object.fromEntries(detail.cards.map((c) => [c.card_id, c.quantity]));
  return { ...cube, result, detail, qty };
}

const nonBasicTotal = (detail) =>
  detail.cards.filter((c) => !BASIC_IDS.includes(c.card_id)).reduce((n, c) => n + c.quantity, 0);

test('an Air-only cube gets 30 Spires, even from a set without basics', async ({ page }) => {
  await signIn(page.context(), 'member');
  // Alpha has no printing of any basic, so Spire can only come from the new rule.
  const cube = await generateCube(page, 'E2E Air Cube', {
    sets: ['alpha'],
    elements: ['Air'],
    cubeSize: 60
  });

  expect(cube.qty.spire).toBe(30);
  for (const id of ['stream', 'valley', 'wasteland']) expect(cube.qty[id]).toBeUndefined();

  // Basics sit outside the cube size everywhere it is counted.
  expect(cube.result.poolSize).toBe(60);
  expect(cube.result.warning).toBeNull();
  expect(nonBasicTotal(cube.detail)).toBe(60);
  expect(cube.detail.card_count).toBe(60);

  await gotoHydrated(page, `/cubes/${cube.slug}`);
  await expect(page.locator('.badge', { hasText: 'cards' }).first()).toHaveText('60 cards');
});

test('no element filter means all four basics, exactly 30 each', async ({ page }) => {
  await signIn(page.context(), 'member');
  // No set filter either, so the random draw could pick basics if it were allowed to.
  const cube = await generateCube(page, 'E2E All Elements Cube', { cubeSize: 120 });

  for (const id of BASIC_IDS) expect(cube.qty[id], id).toBe(30);
  expect(cube.result.poolSize).toBe(120);
  expect(nonBasicTotal(cube.detail)).toBe(120);
});

test('packs never contain a basic site', async ({ page }) => {
  await signIn(page.context(), 'member');
  const cube = await generateCube(page, 'E2E Pack Cube', { elements: ['Fire'], cubeSize: 60 });
  expect(cube.qty.wasteland).toBe(30);

  // 4 packs of 15 uses every non-basic card exactly; with basics in the pool
  // there would be 90 to deal from and some would land in the packs.
  const res = await page.request.post(`/api/cubes/${cube.id}/packs`, {
    data: { players: 1, packsPerPlayer: 4, cardsPerPack: 15 }
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const { packs } = await res.json();
  const dealt = packs.flat();
  expect(dealt).toHaveLength(60);
  expect(dealt.filter((c) => BASIC_IDS.includes(c.id))).toEqual([]);

  // Asking for more than the non-basic pool fails rather than padding with basics.
  const tooMany = await page.request.post(`/api/cubes/${cube.id}/packs`, {
    data: { players: 1, packsPerPlayer: 5, cardsPerPack: 15 }
  });
  expect(tooMany.status()).toBe(400);
});
