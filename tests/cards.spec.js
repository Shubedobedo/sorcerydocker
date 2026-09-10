import { test, expect } from '@playwright/test';

// The card grid renders one link per card; the nav's own "/cards" link has no
// trailing slash, so this selector matches only cards.
const CARD_LINKS = 'a[href^="/cards/"]';
const SEARCH_BOX = 'input[placeholder="Search by name..."]';
const PAGE_SIZE = 24; // must match the server load function's page size

// Runs against the isolated data/e2e.db built by tests/seed-e2e-db.js, whose card
// catalog is copied from the real database — hence relative assertions, never a
// hardcoded catalog size.

const cardCount = (page) => page.locator(CARD_LINKS).count();

/** Reads the "N cards found" label so assertions don't hardcode a catalog size. */
async function reportedTotal(page) {
  const text = await page
    .locator('main p', { hasText: /cards found/ })
    .first()
    .textContent();
  return Number(text.replace(/[^0-9]/g, ''));
}

/** Scrolls to the sentinel and waits for the next page to be appended. */
async function scrollForMore(page, expected) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => cardCount(page), { timeout: 10_000 }).toBe(expected);
}

/**
 * Submits the card search.
 *
 * The search box is a bare <input> with an onkeydown handler — no <form> and no
 * action — so Enter does nothing until the page hydrates. Hydration also resets
 * the input, because `bind:value={filters.q}` re-applies the (empty) server
 * value over anything typed beforehand. Retrying the fill-and-submit is what
 * makes this deterministic rather than a race against hydration.
 */
async function search(page, term) {
  const box = page.locator(SEARCH_BOX);
  await expect
    .poll(
      async () => {
        if (page.url().includes(`q=${term}`)) return true;
        try {
          await box.fill(term);
          await box.press('Enter');
        } catch {
          // element detached mid-navigation; the next poll re-reads it
        }
        return page.url().includes(`q=${term}`);
      },
      { timeout: 15_000 }
    )
    .toBe(true);
}

// Fail any test that logs a console error — the closest thing this repo has to
// a runtime smoke check, since there is no type checking.
test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  page.on('pageerror', (err) => errors.push(String(err)));
  page.consoleErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page.consoleErrors, `console errors: ${page.consoleErrors.join('\n')}`).toEqual([]);
});

test.describe('/cards', () => {
  test('renders the first page of the catalog', async ({ page }) => {
    await page.goto('/cards');
    await expect(page.getByRole('heading', { name: 'Card Database' })).toBeVisible();
    expect(await cardCount(page)).toBe(PAGE_SIZE);
    expect(await reportedTotal(page)).toBeGreaterThan(PAGE_SIZE);
  });

  // cardList is $derived(data.cards) and loadMore() reassigns it to append the
  // next page. Reassignment overrides a derived, so this guards that override.
  test('infinite scroll appends pages', async ({ page }) => {
    await page.goto('/cards');
    expect(await cardCount(page)).toBe(PAGE_SIZE);

    await scrollForMore(page, PAGE_SIZE * 2);
    await scrollForMore(page, PAGE_SIZE * 3);
    await scrollForMore(page, PAGE_SIZE * 4);
  });

  // The other half of derived-with-override: when `data` changes the override
  // must be discarded, not appended to.
  test('searching resets the appended list instead of appending to it', async ({ page }) => {
    await page.goto('/cards');
    await scrollForMore(page, PAGE_SIZE * 2);

    await search(page, 'dragon');

    await expect(page).toHaveURL(/\?q=dragon/);
    const total = await reportedTotal(page);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(PAGE_SIZE);
    // The stale 48 must be gone, replaced by exactly the filtered results.
    await expect.poll(() => cardCount(page)).toBe(total);
  });

  // `filters` stays $state (bind:value needs a proxy) and is re-synced by an
  // $effect on navigation. Going back must clear the search box, not just the list.
  test('back button resyncs the filter inputs', async ({ page }) => {
    await page.goto('/cards');
    const total = await reportedTotal(page);

    await search(page, 'dragon');
    await expect(page).toHaveURL(/\?q=dragon/);
    await expect(page.locator(SEARCH_BOX)).toHaveValue('dragon');

    await page.goBack();

    await expect(page).toHaveURL(/\/cards$/);
    await expect(page.locator(SEARCH_BOX)).toHaveValue('');
    await expect.poll(() => cardCount(page)).toBe(PAGE_SIZE);
    expect(await reportedTotal(page)).toBe(total);
  });

  test('a card links through to its detail page', async ({ page }) => {
    await page.goto('/cards?q=dragon');
    const first = page.locator(CARD_LINKS).first();
    const href = await first.getAttribute('href');

    await first.click();

    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
