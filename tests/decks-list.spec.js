import { test, expect } from '@playwright/test';
import { signIn } from './helpers/auth.js';
import { CUBE } from './helpers/fixtures.js';

/**
 * Deck cards on /decks name the cube a cube-format deck was built from. On the
 * public list that name is shown only when the cube is public too, so a public
 * deck can't leak the name of a private cube.
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

const card = (page, section, deckName) =>
  page
    .locator('.deck-section', { has: page.getByRole('heading', { name: section }) })
    .locator('.deck-card', { hasText: deckName });

test('my cube deck shows the cube it is from', async ({ page }) => {
  await signIn(page.context(), 'member');
  const res = await page.request.post('/api/decks', {
    data: { name: 'Member Draft Deck', format: 'cube', cube_id: CUBE.id }
  });
  expect(res.ok(), await res.text()).toBeTruthy();

  await page.goto('/decks');
  await expect(card(page, 'My Decks', 'Member Draft Deck')).toContainText(CUBE.name);
});

test('a public deck names its cube only when the cube is public', async ({ browser, page }) => {
  const admin = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  await signIn(admin, 'admin');
  const cube = await (
    await admin.request.post('/api/cubes', { data: { name: 'E2E Secret Cube' } })
  ).json();
  const deck = await (
    await admin.request.post('/api/decks', {
      data: { name: 'E2E Public Cube Deck', format: 'cube', cube_id: cube.id }
    })
  ).json();
  await admin.request.patch(`/api/decks/${deck.id}`, { data: { visibility: 'public' } });

  await signIn(page.context(), 'member');
  await page.goto('/decks');
  const publicCard = card(page, 'Public Decks', 'E2E Public Cube Deck');
  await expect(publicCard).toBeVisible();
  await expect(publicCard).not.toContainText('E2E Secret Cube');

  await admin.request.patch(`/api/cubes/${cube.id}`, { data: { visibility: 'public' } });
  await page.goto('/decks');
  await expect(publicCard).toContainText('E2E Secret Cube');
  await admin.close();
});
