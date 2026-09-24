import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth.js';
import { AVATARS } from './helpers/fixtures.js';
import { gotoHydrated } from './helpers/hydration.js';

/**
 * The trade list is a staging area on /trades: binder entries (or some of their
 * copies) are picked into it, it totals their market value, and one button
 * marks the whole list traded.
 *
 * The rows are seeded under a set id no real printing uses, so the collection
 * checks can't collide with the member's ~700 seeded collection rows. The two
 * cards are the fixture avatars only because the seed already guarantees they
 * exist; nothing here depends on them being avatars.
 */
const SET_ID = 'e2e-trade-list';
const PARTIAL = { card_id: AVATARS.inPool, name: 'Battlemage', quantity: 3, listed: 2 };
const WHOLE = { card_id: AVATARS.outOfPool, name: 'Sorcerer', quantity: 1 };

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(String(err)));
  page.consoleErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page.consoleErrors, `console errors:\n${page.consoleErrors.join('\n')}`).toEqual([]);
});

/** Puts `quantity` copies in the collection and the same copies in the binder. */
async function seedBinderEntry(page, { card_id, quantity }) {
  const coll = await page.request.post('/api/collection', {
    data: { card_id, set_id: SET_ID, quantity }
  });
  expect(coll.ok()).toBeTruthy();
  const trade = await page.request.post('/api/trades', {
    data: { card_id, set_id: SET_ID, quantity }
  });
  expect(trade.status()).toBe(201);
  return trade.json();
}

async function collectionQuantity(page, card_id) {
  const rows = await (await page.request.get('/api/collection')).json();
  return rows.find((r) => r.card_id === card_id && r.set_id === SET_ID)?.quantity ?? 0;
}

const dollars = (text) => parseFloat(text.replace(/[^0-9.]/g, ''));

test.describe.configure({ mode: 'serial' });

test.describe('trade list', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context, 'member');
  });

  test('pick, total, remove, and mark all traded', async ({ page }) => {
    await seedBinderEntry(page, PARTIAL);
    await seedBinderEntry(page, WHOLE);

    await gotoHydrated(page, '/trades');
    const list = page.getByRole('region', { name: 'Trade List' });
    await expect(list).toHaveCount(0);

    const binderCard = (name) =>
      page.locator('.trade-card:not(.archived-card)').filter({ hasText: name });

    // A multi-copy entry asks how many copies to list; a single copy does not.
    await binderCard(PARTIAL.name).getByLabel('Copies to list').fill(String(PARTIAL.listed));
    await binderCard(PARTIAL.name).getByRole('button', { name: 'Add to List' }).click();
    await expect(binderCard(WHOLE.name).getByLabel('Copies to list')).toHaveCount(0);
    await binderCard(WHOLE.name).getByRole('button', { name: 'Add to List' }).click();

    const rows = list.getByRole('listitem');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: PARTIAL.name })).toContainText(`${PARTIAL.listed}x`);

    // The total is the sum of each row's price x listed copies.
    const subtotals = (await list.locator('.list-subtotal').allTextContents()).map(dollars);
    const total = dollars(await list.locator('.list-total').textContent());
    expect(total).toBeCloseTo(
      subtotals.reduce((a, b) => a + b, 0),
      2
    );

    // Removing from the list leaves the binder entry alone.
    await rows.filter({ hasText: WHOLE.name }).getByRole('button', { name: 'Remove' }).click();
    await expect(rows).toHaveCount(1);
    await expect(binderCard(WHOLE.name)).toBeVisible();

    await binderCard(WHOLE.name).getByRole('button', { name: 'Add to List' }).click();
    await expect(rows).toHaveCount(2);

    await list.getByRole('button', { name: 'Mark All Traded' }).click();
    await page.locator('.modal').getByRole('button', { name: 'Confirm' }).click();

    await expect(list).toHaveCount(0);
    // The partial entry keeps its untraded copy; the whole entry leaves the binder.
    await expect(binderCard(PARTIAL.name).locator('.trade-meta')).toContainText(
      `${PARTIAL.quantity - PARTIAL.listed}x`
    );
    await expect(binderCard(WHOLE.name)).toHaveCount(0);

    const history = page.locator('.trade-list.archived');
    await expect(history).toContainText(PARTIAL.name);
    await expect(history).toContainText(WHOLE.name);

    expect(await collectionQuantity(page, PARTIAL.card_id)).toBe(PARTIAL.quantity - PARTIAL.listed);
    expect(await collectionQuantity(page, WHOLE.card_id)).toBe(0);
  });

  test('the API clamps quantities, checks ownership, and tolerates an empty list', async ({
    page,
    browser
  }) => {
    const trade = await seedBinderEntry(page, { card_id: PARTIAL.card_id, quantity: 2 });

    const setListed = (p, list_quantity) =>
      p.request.patch('/api/trades', { data: { id: trade.id, list_quantity } });

    // The stored value is only visible through the page, so read it back there.
    const onList = page.locator('.on-list');

    // Under zero clamps to off the list.
    expect((await setListed(page, 1)).ok()).toBeTruthy();
    expect((await setListed(page, -5)).ok()).toBeTruthy();
    await page.goto('/trades');
    await expect(onList).toHaveCount(0);

    // Over the entry's quantity clamps down to it.
    expect((await setListed(page, 99)).ok()).toBeTruthy();
    await page.goto('/trades');
    await expect(onList).toHaveText(/\(2x\)/);

    const complete = await page.request.post('/api/trades/list/complete');
    expect(complete.ok()).toBeTruthy();
    expect((await complete.json()).traded).toBe(1);
    // All 2 copies were traded, so none are left in the collection.
    expect(await collectionQuantity(page, PARTIAL.card_id)).toBe(0);

    const again = await page.request.post('/api/trades/list/complete');
    expect(again.ok()).toBeTruthy();
    expect((await again.json()).traded).toBe(0);

    const other = await seedBinderEntry(page, { card_id: WHOLE.card_id, quantity: 1 });

    // Another user cannot put the member's entry on a list.
    const adminContext = await browser.newContext();
    await signIn(adminContext, 'admin');
    const adminPage = await adminContext.newPage();
    const denied = await adminPage.request.patch('/api/trades', {
      data: { id: other.id, list_quantity: 1 }
    });
    expect(denied.status()).toBe(404);
    expect((await (await page.request.post('/api/trades/list/complete')).json()).traded).toBe(0);
    await adminContext.close();
  });
});
