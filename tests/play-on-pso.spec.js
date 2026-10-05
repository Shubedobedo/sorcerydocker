import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth.js';
import { AVATARS } from './helpers/fixtures.js';
import { gotoHydrated } from './helpers/hydration.js';
import { decodePsoLink, PSO_PREFIX } from './helpers/psoLink.js';

/**
 * "Play on PSO" on the deck page copies a Cursed Realm legacy link that Play
 * Sorcery Online can import. The link itself is unit-tested in pso-link.spec.js;
 * this checks the button wires the deck's real data into it. Nothing here calls
 * playsorceryonline.com or cursedrealm.org — the link is only built and decoded.
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

let deck;

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  await signIn(ctx, 'member');
  deck = await (await ctx.request.post('/api/decks', { data: { name: 'E2E PSO Deck' } })).json();
  for (const data of [
    { card_id: AVATARS.inPool, zone: 'avatar' },
    { card_id: AVATARS.outOfPool, zone: 'spellbook', quantity: 3 }
  ]) {
    const res = await ctx.request.post(`/api/decks/${deck.id}/cards`, { data });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
  await ctx.close();
});

test('copies a link that decodes to this deck', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await signIn(context, 'member');
  await gotoHydrated(page, `/decks/${deck.slug}`);

  await page.getByRole('button', { name: 'Play on PSO' }).click();
  await expect(page.locator('.toast')).toContainText('PSO link copied');

  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(decodePsoLink(url)).toEqual({
    n: 'E2E PSO Deck',
    a: [['Battlemage', 1]],
    t: [],
    s: [['Sorcerer', 3]],
    c: []
  });
});

test('shows the link to select when the clipboard is unavailable', async ({ page, context }) => {
  // No clipboard permission: writeText rejects, as it does over plain http.
  await signIn(context, 'member');
  await gotoHydrated(page, `/decks/${deck.slug}`);

  await page.getByRole('button', { name: 'Play on PSO' }).click();
  const field = page.getByLabel('PSO link');
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute('readonly', '');
  const url = await field.inputValue();
  expect(url.startsWith(PSO_PREFIX)).toBe(true);
  expect(decodePsoLink(url).s).toEqual([['Sorcerer', 3]]);
});

test('other viewers of a public deck get the button too', async ({ page, context }) => {
  const owner = await page.context().browser().newContext({
    baseURL: test.info().project.use.baseURL
  });
  await signIn(owner, 'member');
  const res = await owner.request.patch(`/api/decks/${deck.id}`, {
    data: { visibility: 'public' }
  });
  expect(res.ok()).toBeTruthy();
  await owner.close();

  await signIn(context, 'admin');
  await gotoHydrated(page, `/decks/${deck.slug}`);
  await expect(page.getByRole('button', { name: 'Play on PSO' })).toBeVisible();
  // Owner-only tools stay owner-only.
  await expect(page.getByRole('link', { name: 'Export Decklist' })).toHaveCount(0);
});
