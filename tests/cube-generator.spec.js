import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import { signIn } from './helpers/auth.js';
import { gotoHydrated } from './helpers/hydration.js';

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

test.describe('edit page controls', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page.context(), 'member');
  });

  async function newCube(page, name) {
    return (await page.request.post('/api/cubes', { data: { name } })).json();
  }

  test('both new controls save and survive a reload', async ({ page }) => {
    const cube = await newCube(page, 'E2E Controls Cube');
    await gotoHydrated(page, `/cubes/${cube.slug}/edit`);

    const toggle = page.getByLabel('Randomize copy counts');
    const slider = page.getByLabel('Element variance');
    await expect(toggle).toBeChecked(); // default on
    await expect(slider).toHaveValue('100'); // default fully random

    await toggle.uncheck();
    await slider.fill('45');
    await page.getByRole('button', { name: 'Save Settings' }).click();
    await expect(page.locator('.gen-result')).toHaveText('Settings saved!');

    await gotoHydrated(page, `/cubes/${cube.slug}/edit`);
    await expect(page.getByLabel('Randomize copy counts')).not.toBeChecked();
    await expect(page.getByLabel('Element variance')).toHaveValue('45');
    expect(savedSettings(cube.id)).toMatchObject({ randomizeCopies: false, elementVariance: 45 });
  });

  test('copies off disables the Max inputs and keeps their values', async ({ page }) => {
    const cube = await newCube(page, 'E2E Max Inputs Cube');
    await gotoHydrated(page, `/cubes/${cube.slug}/edit`);
    const maxInputs = page.locator('.max-input');
    await expect(maxInputs).toHaveCount(4);

    await maxInputs.first().fill('2');
    await page.getByLabel('Randomize copy counts').uncheck();
    for (let i = 0; i < 4; i++) await expect(maxInputs.nth(i)).toBeDisabled();
    await expect(page.locator('.copies-hint')).toHaveText(
      'Every card gets standard copies: 4 Ordinary, 3 Exceptional, 2 Elite, 1 Unique. The cube size may round up by a few cards to fit the last card.'
    );
    // The rarity on/off checkboxes keep working.
    await expect(page.getByLabel('Exceptional', { exact: true })).toBeEnabled();

    await page.getByLabel('Randomize copy counts').check();
    for (let i = 0; i < 4; i++) await expect(maxInputs.nth(i)).toBeEnabled();
    await expect(maxInputs.first()).toHaveValue('2');
    await expect(page.locator('.copies-hint')).toHaveCount(0);
  });

  test('the variance slider is disabled with exactly one element', async ({ page }) => {
    const cube = await newCube(page, 'E2E Slider Cube');
    await gotoHydrated(page, `/cubes/${cube.slug}/edit`);
    const slider = page.getByLabel('Element variance');
    await expect(slider).toBeEnabled(); // none selected = all four
    await page.getByRole('button', { name: 'Air', exact: true }).click();
    await expect(slider).toBeDisabled();
    await page.getByRole('button', { name: 'Fire', exact: true }).click();
    await expect(slider).toBeEnabled();
  });

  test('an overshooting generate shows the new size, notes and breakdown', async ({ page }) => {
    const cube = await newCube(page, 'E2E Overshoot UI Cube');
    await gotoHydrated(page, `/cubes/${cube.slug}/edit`);

    await page.locator('.size-input').fill('30');
    await page.getByLabel('Randomize copy counts').uncheck();
    for (const r of ['Exceptional', 'Elite', 'Unique']) {
      await page.getByLabel(r, { exact: true }).uncheck();
    }
    await page.getByRole('button', { name: 'Generate Cube Pool' }).click();

    await expect(page.locator('.gen-result')).toHaveText('Generated cube with 32 cards!');
    await expect(page.locator('.size-input')).toHaveValue('32');
    await expect(page.locator('.gen-notes')).toContainText(
      'Pool is 32 (was 30): cube size rounded up to fit the last card at full copies.'
    );
    await expect(page.locator('.gen-breakdown')).toHaveText(
      /^Air \d+ · Earth \d+ · Fire \d+ · Water \d+ \(sites \d+ \/ \d+ \/ \d+ \/ \d+\)$/
    );
    await expect(page.locator('.toast-warning')).toHaveCount(0); // a note, not an error

    // Saving again must keep 32, not PATCH the old 30 back.
    await page.getByRole('button', { name: 'Save Settings' }).click();
    await expect(page.locator('.gen-result')).toHaveText('Settings saved!');
    expect(savedSettings(cube.id).cubeSize).toBe(32);
    await gotoHydrated(page, `/cubes/${cube.slug}/edit`);
    await expect(page.locator('.size-input')).toHaveValue('32');
  });
});
