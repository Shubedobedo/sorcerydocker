import { test, expect } from '@playwright/test';
import { signIn, USERS } from './helpers/auth.js';
import { CUBE, AVATARS } from './helpers/fixtures.js';
import { gotoHydrated } from './helpers/hydration.js';

/**
 * A deck holds exactly one avatar, stored as a third `deck_cards.zone`
 * alongside atlas and spellbook.
 *
 * For a cube deck the avatar must come from that cube's pool, with one standing
 * exception: Spellslinger is legal in every deck. The seeded cube keeps
 * Spellslinger out of its pool precisely so the exception is provable — if it
 * were in the pool, a passing test would say nothing about the exception.
 */

/** Creates a plain (non-cube) deck owned by the member. */
async function createDeck(page) {
  const res = await page.request.post('/api/decks', {
    data: { name: `E2E Avatar ${Date.now()}`, format: 'standard' }
  });
  expect(res.status()).toBe(201);
  return res.json();
}

/** Creates a deck bound to the seeded cube. */
async function createCubeDeck(page) {
  const res = await page.request.post('/api/decks', {
    data: { name: `E2E Cube Deck ${Date.now()}`, format: 'cube', cube_id: CUBE.id }
  });
  expect(res.status()).toBe(201);
  return res.json();
}

function setAvatar(page, deck, card_id) {
  return page.request.post(`/api/decks/${deck.id}/cards`, {
    data: { card_id, zone: 'avatar' }
  });
}

/** The deck's rows, as returned to the owner (the endpoint returns a bare array). */
async function cardsOf(page, deck) {
  const res = await page.request.get(`/api/decks/${deck.id}/cards/list`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

test.describe('deck avatars', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context, 'member');
  });

  test('a normal deck accepts any avatar', async ({ page }) => {
    const deck = await createDeck(page);

    const res = await setAvatar(page, deck, AVATARS.outOfPool);
    expect(res.ok()).toBeTruthy();

    const cards = await cardsOf(page, deck);
    const avatars = cards.filter((c) => c.zone === 'avatar');
    expect(avatars).toHaveLength(1);
    expect(avatars[0].card_id).toBe(AVATARS.outOfPool);

    await page.request.delete(`/api/decks/${deck.id}`);
  });

  test('a non-avatar card is refused from the avatar zone', async ({ page }) => {
    const deck = await createDeck(page);

    const { cards: catalog } = await (await page.request.get('/api/cards?page=1')).json();
    const minion = catalog.find((c) => c.type === 'Minion');
    expect(minion, 'expected a Minion on the first page of the catalog').toBeTruthy();

    const res = await setAvatar(page, deck, minion.id);
    expect(res.status()).toBe(422);

    await page.request.delete(`/api/decks/${deck.id}`);
  });

  test('setting a second avatar replaces the first rather than adding one', async ({ page }) => {
    const deck = await createDeck(page);

    expect((await setAvatar(page, deck, AVATARS.outOfPool)).ok()).toBeTruthy();
    expect((await setAvatar(page, deck, AVATARS.spellslinger)).ok()).toBeTruthy();

    const cards = await cardsOf(page, deck);
    const avatars = cards.filter((c) => c.zone === 'avatar');
    expect(avatars).toHaveLength(1);
    expect(avatars[0].card_id).toBe(AVATARS.spellslinger);
    expect(avatars[0].quantity).toBe(1);

    await page.request.delete(`/api/decks/${deck.id}`);
  });

  test('a cube deck accepts an avatar from its own pool', async ({ page }) => {
    const deck = await createCubeDeck(page);

    const res = await setAvatar(page, deck, AVATARS.inPool);
    expect(res.ok()).toBeTruthy();

    await page.request.delete(`/api/decks/${deck.id}`);
  });

  test('a cube deck refuses an avatar outside its pool', async ({ page }) => {
    const deck = await createCubeDeck(page);

    const res = await setAvatar(page, deck, AVATARS.outOfPool);
    expect(res.status()).toBe(422);

    await page.request.delete(`/api/decks/${deck.id}`);
  });

  // The exception. Spellslinger is not in the seeded pool, so the previous test
  // is what this one is measured against: same deck shape, same out-of-pool
  // situation, opposite outcome.
  test('a cube deck accepts Spellslinger even though it is not in the pool', async ({ page }) => {
    const deck = await createCubeDeck(page);

    const res = await setAvatar(page, deck, AVATARS.spellslinger);
    expect(res.ok()).toBeTruthy();

    const cards = await cardsOf(page, deck);
    expect(cards.filter((c) => c.zone === 'avatar')[0].card_id).toBe(AVATARS.spellslinger);

    await page.request.delete(`/api/decks/${deck.id}`);
  });

  test('the deck page warns when no avatar is selected', async ({ page }) => {
    const deck = await createDeck(page);

    await page.goto(`/decks/${deck.slug}`);
    // Scoped to the warnings list: the avatar slot renders its own empty state
    // with similar wording, and an unscoped match would hit both.
    await expect(page.locator('.warnings').getByText(/no avatar selected/i)).toBeVisible();

    await page.request.delete(`/api/decks/${deck.id}`);
  });

  test('the avatar is excluded from the spellbook count', async ({ page }) => {
    const deck = await createDeck(page);
    // Assert the write landed: without this the count below is trivially 0 and the
    // test would pass even with no avatar support at all.
    expect((await setAvatar(page, deck, AVATARS.spellslinger)).ok()).toBeTruthy();

    await page.goto(`/decks/${deck.slug}`);
    // The standard-format warning counts the spellbook; an avatar must not
    // inflate it, or a legal deck would read as 61 cards.
    await expect(page.getByText(/Spellbook: 0\/60/)).toBeVisible();

    await page.request.delete(`/api/decks/${deck.id}`);
  });

  test('import and export round-trip the avatar', async ({ page }) => {
    const deck = await createDeck(page);

    const imported = await page.request.post(`/api/decks/${deck.id}/import`, {
      data: '// Avatar\n1x Spellslinger\n\n// Spellbook\n',
      headers: { 'Content-Type': 'text/plain' }
    });
    expect(imported.ok()).toBeTruthy();

    const cards = await cardsOf(page, deck);
    const avatars = cards.filter((c) => c.zone === 'avatar');
    expect(avatars).toHaveLength(1);
    expect(avatars[0].card_id).toBe(AVATARS.spellslinger);

    const exported = await page.request.get(`/api/decks/${deck.id}/export`);
    const text = await exported.text();
    expect(text).toContain('// Avatar');
    expect(text).toContain('1x Spellslinger');

    await page.request.delete(`/api/decks/${deck.id}`);
  });
});

// The picker is a <select> wired to an onchange handler, which compiles fine
// whether or not it actually fires. Nothing else in this file touches the UI
// that owners actually use, so this drives it end to end.
test.describe('the avatar picker', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context, 'member');
  });

  test('selecting an avatar persists it to the deck page', async ({ page }) => {
    const deck = await createDeck(page);

    await gotoHydrated(page, `/decks/${deck.slug}/edit`);
    await page.locator('.avatar-picker select').selectOption(AVATARS.spellslinger);

    await expect(page.locator('.avatar-picker select')).toHaveValue(AVATARS.spellslinger);

    await page.goto(`/decks/${deck.slug}`);
    await expect(page.locator('.avatar-card')).toContainText('Spellslinger');
    // The 30/60 count warnings stay (the deck is empty); only the avatar one clears.
    await expect(page.locator('.warnings').getByText(/no avatar selected/i)).toHaveCount(0);

    await page.request.delete(`/api/decks/${deck.id}`);
  });

  test('a cube deck offers only pool avatars plus Spellslinger', async ({ page }) => {
    const deck = await createCubeDeck(page);

    await gotoHydrated(page, `/decks/${deck.slug}/edit`);
    const options = await page
      .locator('.avatar-picker select option')
      .evaluateAll((els) => els.map((e) => e.value).filter(Boolean));

    expect(options).toContain(AVATARS.inPool);
    expect(options).toContain(AVATARS.spellslinger);
    expect(options).not.toContain(AVATARS.outOfPool);

    await page.request.delete(`/api/decks/${deck.id}`);
  });
});
