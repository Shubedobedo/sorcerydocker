# Cube Generator Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Randomize copy counts" toggle and an "Element variance" slider to cube generation, replace the biased shuffle, and keep colourless cards eligible under an element filter.

**Architecture:** A new pure module `src/lib/server/cubePool.js` holds every generation rule: the shuffle, element shares, bucket quotas and the deficit-driven fill loop. All randomness goes through an injected `rng`. The generate endpoint keeps the DB loading, filtering, basic sites and persistence, and calls `buildPool()`. The cube edit page gets the two controls and shows the per-element breakdown and notes.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Drizzle 0.38 over better-sqlite3, Playwright (unit tests run in plain Node through Playwright, like `tests/pso-link.spec.js`).

**Spec:** `docs/superpowers/specs/2026-10-07-cube-generator-balance-design.md` (including its "Clarifications" section, which wins over the body).

## Global Constraints

- **New settings.** Both live in the existing `cubes.settings` JSON; no migration.
  - `randomizeCopies`: boolean, default `true`.
  - `elementVariance`: integer 30–100, default `100`, clamped to 30–100.
  - Both are read with `??`, in the generator **and** the edit page.
- **Colourless.** A card is colourless when its `elements` is `[]` or `["None"]`.
  - Colourless cards always pass the element filter.
  - A multi-element card passes only if all its elements are selected.
  - An empty element filter means all four elements: Air, Earth, Fire, Water.
- **Copy counts.**
  - Copies on: `max = rarities[r].max ?? getDefaultMax(r)`. Never overshoots `cubeSize`.
  - Copies off: `max = getDefaultMax(r)` (4/3/2/1), ignoring `rarities[r].max`. The full max is added at once, never truncated. Overshoot is ≤ 3.
  - Avatars are always 1 copy in both modes.
  - A card with a `null` rarity is treated as Ordinary.
- **Basic sites:** the logic in `src/lib/server/basicSites.js` is unchanged. Basics are added after the draw and are outside `cubeSize`.
- **Overshoot:** writes `totalAdded` back to `settings.cubeSize`, in the same `cubes` update that sets `updated_at`.
- **Shortfall:** keeps the warning text `Could only generate X/Y cards with current settings` and doesn't change `cubeSize`.
- **Overshoot note text:** `Pool is N (was M): cube size rounded up to fit the last card at full copies.`
- **Run-dry note text:** `<Element> <spells|sites> ran out of eligible cards (got X of Y); the rest was filled from other elements.`
- **Response:** `{ success, poolSize, cubeSize, warning, notes, elementCounts: { spells: {E: n}, sites: {E: n} } }`. `elementCounts` has keys for the selected elements only and counts copies of single-element, non-basic cards.
- **UI copy, verbatim:**
  - "Randomize copy counts".
  - The copies-off hint: "Every card gets standard copies: 4 Ordinary, 3 Exceptional, 2 Elite, 1 Unique. The cube size may round up by a few cards to fit the last card."
  - "Element variance", with end labels "30% (near even)" and "100% (fully random)".
  - The variance hint: "How far each element's share can stray from an even split. Colourless and multi-element cards aren't affected."
- **Out of scope:** pack generation, the deck builder, `/api/v1`, and the "Sizes" section. The cube size input stays where it is.
- **Formatting and commits:** Prettier (2 spaces, single quotes, no trailing commas, 100 cols). Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **An old cube with neither new key, regenerated.** It must behave as before: copies on, fully random split, exact size. Tested in Task 1 (`normalizeSettings({})`) and Task 3 (E2E exact size).
2. **`rng()` returning exactly 0.** This must not loop forever, add 0 copies, or produce `NaN` shares. Tested in Task 1 (`elementShares`) and Task 2 (`buildPool` with `() => 0`).
3. **A tiny or zero `cubeSize`, or more up-front avatars than `cubeSize`.** No crash and no infinite loop. Tested in Task 2.
4. **The sets chosen contain no sites at all.** All of the budget must go to spells, with no spurious "sites ran out" notes from rounding. Tested in Task 2.
5. **Overshoot, then Save Settings without generating again.** The saved size must stay at the new value, not be PATCHed back. Tested in Task 4 (reload after generate, then Save).

---

## File structure

| File                                                     | Responsibility                                                                                                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/cubePool.js` (create)                    | Pure generation rules: `ELEMENTS`, `getDefaultMax`, `normalizeSettings`, `cardElements`, `passesElementFilter`, `selectedElements`, `shuffle`, `elementShares`, `buildPool` |
| `src/routes/api/cubes/[id]/generate/+server.js` (modify) | DB load, set/element/rarity filters, avatars, calls `buildPool`, basic sites, persistence, response                                                                         |
| `src/routes/cubes/[slug]/edit/+page.svelte` (modify)     | Toggle, slider, breakdown, notes, adopting an overshoot size                                                                                                                |
| `tests/helpers/rng.js` (create)                          | Seeded `mulberry32(seed)` for unit tests                                                                                                                                    |
| `tests/cube-pool.spec.js` (create)                       | Unit tests for `cubePool.js` (plain Node)                                                                                                                                   |
| `tests/cube-generator.spec.js` (create)                  | E2E tests for the endpoint and the edit page                                                                                                                                |
| `CLAUDE.md` (modify)                                     | Short "Cube generation" section                                                                                                                                             |

**Run unit tests:** `npx playwright test tests/cube-pool.spec.js --reporter=line`. This still boots the dev server once, because `webServer` is global config, but these tests need no browser page.

**Run E2E:** `npx playwright test tests/cube-generator.spec.js --reporter=line`.

**Git Bash note:** never pass `-g` a pattern starting with `/`. Git Bash rewrites it into a Windows path.

---

### Task 1: Primitives — settings, element classes, shuffle, element shares

**Files:**

- Create: `src/lib/server/cubePool.js`
- Create: `tests/helpers/rng.js`
- Test: `tests/cube-pool.spec.js`

**Interfaces:**

- Produces (`src/lib/server/cubePool.js`):
  - `ELEMENTS = ['Air', 'Earth', 'Fire', 'Water']`
  - `VARIANCE_MIN = 30`, `VARIANCE_MAX = 100`
  - `getDefaultMax(rarity: string|null) → number`: 4/3/2/1, and 4 for anything else
  - `normalizeSettings(settings?: object) → { randomizeCopies: boolean, elementVariance: number }`
  - `cardElements(card: { elements: string|string[] }) → string[]`: drops `"None"`
  - `passesElementFilter(card, allowedElements: string[]) → boolean`
  - `selectedElements(elements: string[]) → string[]`: in `ELEMENTS` order; empty or unknown gives all four
  - `shuffle(arr: any[], rng?: () => number) → arr`: in place, Fisher–Yates
  - `elementShares(elements: string[], variance: number, rng?) → { [element]: number }`: keys are `selectedElements(elements)`
- Produces (`tests/helpers/rng.js`): `mulberry32(seed: number) → () => number` in `[0, 1)`

- [ ] **Step 1: Write the seeded rng helper**

`tests/helpers/rng.js`:

```js
/**
 * Seeded PRNG for deterministic unit tests (mulberry32). Returns a function
 * with the same contract as Math.random: a float in [0, 1).
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 2: Write the failing tests**

`tests/cube-pool.spec.js`:

```js
import { test, expect } from '@playwright/test';
import {
  ELEMENTS,
  cardElements,
  elementShares,
  getDefaultMax,
  normalizeSettings,
  passesElementFilter,
  selectedElements,
  shuffle
} from '../src/lib/server/cubePool.js';
import { mulberry32 } from './helpers/rng.js';

// Pure generation rules, run in plain Node with a seeded rng: no page fixture.

const card = (elements) => ({ elements: JSON.stringify(elements) });
const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

test.describe('settings and element classes', () => {
  test('missing keys default to copies on and fully random', () => {
    expect(normalizeSettings({})).toEqual({ randomizeCopies: true, elementVariance: 100 });
    expect(normalizeSettings()).toEqual({ randomizeCopies: true, elementVariance: 100 });
  });

  test('false is kept, and variance is rounded and clamped to 30-100', () => {
    expect(normalizeSettings({ randomizeCopies: false }).randomizeCopies).toBe(false);
    expect(normalizeSettings({ elementVariance: 0 }).elementVariance).toBe(30);
    expect(normalizeSettings({ elementVariance: 500 }).elementVariance).toBe(100);
    expect(normalizeSettings({ elementVariance: 47.6 }).elementVariance).toBe(48);
    expect(normalizeSettings({ elementVariance: 'junk' }).elementVariance).toBe(100);
  });

  test('standard copy counts', () => {
    expect(['Ordinary', 'Exceptional', 'Elite', 'Unique', null].map(getDefaultMax)).toEqual([
      4, 3, 2, 1, 4
    ]);
  });

  test('"None" and [] are both colourless', () => {
    expect(cardElements(card(['None']))).toEqual([]);
    expect(cardElements(card([]))).toEqual([]);
    expect(cardElements({ elements: null })).toEqual([]);
    expect(cardElements(card(['Fire', 'Air']))).toEqual(['Fire', 'Air']);
  });

  test('colourless cards pass any element filter; multi needs every element', () => {
    expect(passesElementFilter(card(['None']), ['Air'])).toBe(true);
    expect(passesElementFilter(card([]), ['Air'])).toBe(true);
    expect(passesElementFilter(card(['Air']), ['Air'])).toBe(true);
    expect(passesElementFilter(card(['Fire']), ['Air'])).toBe(false);
    expect(passesElementFilter(card(['Air', 'Water']), ['Air'])).toBe(false);
    expect(passesElementFilter(card(['Air', 'Water']), ['Water', 'Air'])).toBe(true);
    expect(passesElementFilter(card(['Fire']), [])).toBe(true);
  });

  test('selected elements come back in canonical order; empty means all four', () => {
    expect(selectedElements([])).toEqual(ELEMENTS);
    expect(selectedElements(['Water', 'Air'])).toEqual(['Air', 'Water']);
    expect(selectedElements(['Bogus'])).toEqual(ELEMENTS);
  });
});

test.describe('shuffle', () => {
  test('is a permutation, in place', () => {
    const arr = [1, 2, 3, 4, 5, 6];
    const out = shuffle(arr, mulberry32(1));
    expect(out).toBe(arr);
    expect([...arr].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('every item lands in every position about equally often', () => {
    // The old sort(() => Math.random() - 0.5) fails this: items keep part of
    // their starting order.
    const rng = mulberry32(42);
    const runs = 24000;
    const n = 4;
    const counts = Array.from({ length: n }, () => Array(n).fill(0));
    for (let r = 0; r < runs; r++) {
      const arr = shuffle([0, 1, 2, 3], rng);
      arr.forEach((item, pos) => counts[item][pos]++);
    }
    const expected = runs / n;
    for (const row of counts) {
      for (const c of row) {
        expect(c).toBeGreaterThan(expected * 0.93);
        expect(c).toBeLessThan(expected * 1.07);
      }
    }
  });
});

test.describe('elementShares', () => {
  test('shares sum to 1 for any element count and variance', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const els of [['Air'], ['Air', 'Fire'], ['Air', 'Fire', 'Water'], []]) {
        for (const v of [30, 65, 100]) {
          expect(sum(elementShares(els, v, mulberry32(seed)))).toBeCloseTo(1, 10);
        }
      }
    }
  });

  test('at 30% every share is at least 0.7 of an even split', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const els of [[], ['Air', 'Earth'], ['Air', 'Earth', 'Fire']]) {
        const shares = elementShares(els, 30, mulberry32(seed));
        const k = Object.keys(shares).length;
        for (const s of Object.values(shares)) expect(s).toBeGreaterThanOrEqual(0.7 / k - 1e-12);
      }
    }
  });

  test('a single element gets everything', () => {
    expect(elementShares(['Air'], 100, mulberry32(3))).toEqual({ Air: 1 });
  });

  test('empty selection splits across all four elements', () => {
    expect(Object.keys(elementShares([], 100, mulberry32(3)))).toEqual(ELEMENTS);
  });

  test('deterministic for a seed', () => {
    expect(elementShares([], 70, mulberry32(9))).toEqual(elementShares([], 70, mulberry32(9)));
  });

  test('out-of-range variance is clamped (0 behaves like 30)', () => {
    const shares = elementShares([], 0, mulberry32(5));
    for (const s of Object.values(shares)) expect(s).toBeGreaterThanOrEqual(0.175 - 1e-12);
  });

  test('an rng that returns 0 gives an even split, not NaN', () => {
    expect(elementShares([], 100, () => 0)).toEqual({
      Air: 0.25,
      Earth: 0.25,
      Fire: 0.25,
      Water: 0.25
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx playwright test tests/cube-pool.spec.js --reporter=line`
Expected: FAIL with `Cannot find module ...src\lib\server\cubePool.js`.

- [ ] **Step 4: Write the primitives**

`src/lib/server/cubePool.js`:

```js
/**
 * Pure cube-pool generation: no DB, no SvelteKit. The generate endpoint loads and
 * filters the catalog, then hands the eligible cards to buildPool(). Every random
 * choice goes through the injected `rng` (Math.random by default) so tests can
 * seed it.
 */

export const ELEMENTS = ['Air', 'Earth', 'Fire', 'Water'];

export const VARIANCE_MIN = 30;
export const VARIANCE_MAX = 100;

const DEFAULT_MAX = { Ordinary: 4, Exceptional: 3, Elite: 2, Unique: 1 };

/** Standard copies per rarity; anything unrecognised (including null) is Ordinary. */
export function getDefaultMax(rarity) {
  return DEFAULT_MAX[rarity] ?? 4;
}

/**
 * The two generator settings with their defaults. Cubes saved before these
 * existed have neither key, so `??` (never `||`, which would turn a saved
 * `false` back into `true`) supplies the old behaviour.
 */
export function normalizeSettings(settings = {}) {
  const variance = Math.round(Number(settings.elementVariance ?? VARIANCE_MAX));
  return {
    randomizeCopies: settings.randomizeCopies ?? true,
    elementVariance: Number.isFinite(variance)
      ? Math.min(VARIANCE_MAX, Math.max(VARIANCE_MIN, variance))
      : VARIANCE_MAX
  };
}

/**
 * A card's real elements. The catalog stores colourless cards as ["None"], and
 * an empty list means the same, so both come back as [].
 */
export function cardElements(card) {
  const raw = Array.isArray(card.elements) ? card.elements : JSON.parse(card.elements || '[]');
  return raw.filter((e) => e !== 'None');
}

/**
 * Colourless cards always pass; any other card needs every one of its elements
 * selected. An empty filter allows everything.
 */
export function passesElementFilter(card, allowedElements = []) {
  if (allowedElements.length === 0) return true;
  return cardElements(card).every((e) => allowedElements.includes(e));
}

/** The elements a cube draws from, in canonical order. Empty (or unknown) means all four. */
export function selectedElements(elements = []) {
  const picked = ELEMENTS.filter((e) => elements.includes(e));
  return picked.length > 0 ? picked : [...ELEMENTS];
}

/** In-place Fisher–Yates shuffle. Unbiased, unlike sort(() => Math.random() - 0.5). */
export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Each selected element's share of the elemental budget: an even split blended
 * with a uniform random (Dirichlet) split. At variance v%, every share is at
 * least (1 - v) of even, so 30% guarantees 17.5% each across four elements.
 */
export function elementShares(elements = [], variance = VARIANCE_MAX, rng = Math.random) {
  const els = selectedElements(elements);
  const even = 1 / els.length;
  const v = normalizeSettings({ elementVariance: variance }).elementVariance / 100;
  // Normalised exponentials are a uniform Dirichlet draw. 1 - rng() keeps the
  // log argument in (0, 1], so it never sees 0.
  const x = els.map(() => -Math.log(1 - rng()));
  const total = x.reduce((a, b) => a + b, 0);
  return Object.fromEntries(
    els.map((e, i) => [e, (1 - v) * even + v * (total > 0 ? x[i] / total : even)])
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx playwright test tests/cube-pool.spec.js --reporter=line`
Expected: all tests PASS.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write src/lib/server/cubePool.js tests/cube-pool.spec.js tests/helpers/rng.js
git add src/lib/server/cubePool.js tests/cube-pool.spec.js tests/helpers/rng.js
git commit -m "feat: add cube pool primitives with an unbiased shuffle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `buildPool` — buckets, quotas, deficit-driven fill, both copy modes

**Files:**

- Modify: `src/lib/server/cubePool.js` (append)
- Test: `tests/cube-pool.spec.js` (append)

**Interfaces:**

- Consumes: everything in Task 1, plus `mulberry32`.
- Produces: `buildPool({ cards, upfront?, elements?, cubeSize, rarities?, randomizeCopies?, elementVariance?, rng? })`, which returns
  `{ pool: { [cardId]: number }, totalAdded: number, cubeSize: number, warning: string|null, notes: string[], elementCounts: { spells: {[E]: number}, sites: {[E]: number} }, shares: {[E]: number} }`.
  - `cards`: eligible cards `{ id, type, rarity, elements }`. Basics and up-front avatars are already removed, and they are already filtered by set, element and rarity.
  - `upfront`: avatars added at 1 copy each before the draw. They count toward the total.
  - `cubeSize` in the result is the size to save: `totalAdded` after an overshoot, otherwise the target.
  - `shares` is the element split that was used. The endpoint doesn't send it; tests use it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/cube-pool.spec.js`. First add `buildPool` to the import list from `'../src/lib/server/cubePool.js'`, then append:

```js
// --- buildPool ---------------------------------------------------------------

const RARITIES = ['Ordinary', 'Exceptional', 'Elite', 'Unique'];

/** A fake card. Colourless cards use the catalog's real ["None"] encoding. */
function fake(id, { type = 'Magic', rarity = 'Ordinary', elements = ['None'] } = {}) {
  return { id, type, rarity, elements: JSON.stringify(elements) };
}

/**
 * 4 elements x (spells + sites) single-element cards plus colourless spells.
 * Rarities cycle unless `rarity` is given. Pass `perElement` to override counts
 * for one element, e.g. { Fire: { spells: 5, sites: 15 } }.
 */
function catalog({ spells = 100, sites = 15, colourless = 100, rarity, perElement = {} } = {}) {
  const out = [];
  let i = 0;
  const r = () => rarity ?? RARITIES[i++ % 4];
  for (const el of ELEMENTS) {
    const n = perElement[el] ?? { spells, sites };
    for (let s = 0; s < n.spells; s++)
      out.push(fake(`${el}-spell-${s}`, { rarity: r(), elements: [el] }));
    for (let s = 0; s < n.sites; s++)
      out.push(fake(`${el}-site-${s}`, { type: 'Site', rarity: r(), elements: [el] }));
  }
  for (let s = 0; s < colourless; s++) out.push(fake(`none-${s}`, { rarity: r() }));
  return out;
}

const byId = (cards) => Object.fromEntries(cards.map((c) => [c.id, c]));
const total = (pool) => Object.values(pool).reduce((a, b) => a + b, 0);

test.describe('buildPool: copies on', () => {
  test('hits the cube size exactly and never exceeds a card max', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const cards = catalog();
      const res = buildPool({ cards, cubeSize: 360, rng: mulberry32(seed) });
      expect(res.totalAdded).toBe(360);
      expect(total(res.pool)).toBe(360);
      expect(res.cubeSize).toBe(360);
      expect(res.warning).toBeNull();
      const index = byId(cards);
      for (const [id, q] of Object.entries(res.pool)) {
        expect(q).toBeGreaterThanOrEqual(1);
        expect(q).toBeLessThanOrEqual(getDefaultMax(index[id].rarity));
      }
    }
  });

  test('custom rarity max is honoured', () => {
    const cards = catalog({ rarity: 'Ordinary' });
    const res = buildPool({
      cards,
      cubeSize: 300,
      rarities: { Ordinary: { enabled: true, max: 2 } },
      rng: mulberry32(7)
    });
    expect(res.totalAdded).toBe(300);
    for (const q of Object.values(res.pool)) expect(q).toBeLessThanOrEqual(2);
  });
});

test.describe('buildPool: copies off', () => {
  test('every card gets the standard max for its rarity, ignoring custom max', () => {
    const cards = catalog();
    const index = byId(cards);
    const res = buildPool({
      cards,
      cubeSize: 360,
      randomizeCopies: false,
      rarities: { Ordinary: { enabled: true, max: 2 }, Exceptional: { enabled: true, max: 1 } },
      rng: mulberry32(11)
    });
    for (const [id, q] of Object.entries(res.pool)) {
      expect(q, id).toBe(getDefaultMax(index[id].rarity));
    }
  });

  test('overshoot: target 10 with Ordinaries only gives 12 and saves 12', () => {
    const res = buildPool({
      cards: catalog({ rarity: 'Ordinary' }),
      cubeSize: 10,
      randomizeCopies: false,
      rng: mulberry32(2)
    });
    expect(res.totalAdded).toBe(12);
    expect(res.cubeSize).toBe(12);
    expect(res.warning).toBeNull();
    expect(res.notes[0]).toBe(
      'Pool is 12 (was 10): cube size rounded up to fit the last card at full copies.'
    );
  });

  test('exact fit: target 12 gives 12 with no note', () => {
    const res = buildPool({
      cards: catalog({ rarity: 'Ordinary' }),
      cubeSize: 12,
      randomizeCopies: false,
      rng: mulberry32(2)
    });
    expect(res.totalAdded).toBe(12);
    expect(res.cubeSize).toBe(12);
    expect(res.notes).toEqual([]);
  });

  test('overshoot never exceeds 3', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 300; i++) {
      const cubeSize = 30 + Math.floor(rng() * 400);
      const res = buildPool({ cards: catalog(), cubeSize, randomizeCopies: false, rng });
      expect(res.totalAdded - cubeSize).toBeGreaterThanOrEqual(0);
      expect(res.totalAdded - cubeSize).toBeLessThanOrEqual(3);
      expect(res.cubeSize).toBe(res.totalAdded);
    }
  });
});

test.describe('buildPool: balance', () => {
  const singleShares = (res) => {
    const per = Object.fromEntries(
      ELEMENTS.map((e) => [e, res.elementCounts.spells[e] + res.elementCounts.sites[e]])
    );
    const all = sum(per);
    return Object.fromEntries(ELEMENTS.map((e) => [e, per[e] / all]));
  };

  test('at 30% every element keeps roughly its 17.5% floor and its planned share', () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (const randomizeCopies of [true, false]) {
        const res = buildPool({
          cards: catalog(),
          cubeSize: 360,
          elementVariance: 30,
          randomizeCopies,
          rng: mulberry32(seed)
        });
        const got = singleShares(res);
        for (const e of ELEMENTS) {
          // 0.175 is the design floor; copies land in chunks of up to 4, so allow slack.
          expect(got[e], `seed ${seed} ${e}`).toBeGreaterThanOrEqual(0.16);
          expect(Math.abs(got[e] - res.shares[e]), `seed ${seed} ${e}`).toBeLessThanOrEqual(0.03);
        }
      }
    }
  });

  test('sites follow the same element split as spells', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const res = buildPool({
        cards: catalog(),
        cubeSize: 720,
        elementVariance: 100,
        rng: mulberry32(seed)
      });
      const { spells, sites } = res.elementCounts;
      const spellTotal = sum(spells);
      const siteTotal = sum(sites);
      for (const e of ELEMENTS) {
        expect(Math.abs(spells[e] / spellTotal - sites[e] / siteTotal)).toBeLessThanOrEqual(0.08);
      }
    }
  });

  test('colourless cards appear at about their natural rate', () => {
    // 100 colourless of 560 cards is 17.9%.
    for (let seed = 1; seed <= 10; seed++) {
      const res = buildPool({ cards: catalog(), cubeSize: 360, rng: mulberry32(seed) });
      const colourless = Object.entries(res.pool)
        .filter(([id]) => id.startsWith('none-'))
        .reduce((n, [, q]) => n + q, 0);
      expect(Math.abs(colourless / 360 - 100 / 560)).toBeLessThanOrEqual(0.02);
    }
  });

  test('elementCounts only has the selected elements and skips colourless', () => {
    const cards = catalog().filter((c) => !/^(Earth|Fire)-/.test(c.id));
    const res = buildPool({ cards, elements: ['Water', 'Air'], cubeSize: 200, rng: mulberry32(4) });
    expect(Object.keys(res.elementCounts.spells)).toEqual(['Air', 'Water']);
    expect(Object.keys(res.elementCounts.sites)).toEqual(['Air', 'Water']);
    const counted = sum(res.elementCounts.spells) + sum(res.elementCounts.sites);
    const elemental = Object.entries(res.pool)
      .filter(([id]) => !id.startsWith('none-'))
      .reduce((n, [, q]) => n + q, 0);
    expect(counted).toBe(elemental);
  });
});

test.describe('buildPool: run-dry and edge cases', () => {
  test('a dry element hands its shortfall to the others and says so', () => {
    const cards = catalog({ rarity: 'Ordinary', perElement: { Fire: { spells: 5, sites: 15 } } });
    const res = buildPool({ cards, cubeSize: 360, elementVariance: 30, rng: mulberry32(8) });
    expect(res.totalAdded).toBe(360);
    expect(res.elementCounts.spells.Fire).toBe(20); // 5 Ordinaries at 4 copies each
    expect(res.notes.join('\n')).toMatch(
      /^Fire spells ran out of eligible cards \(got 20 of \d+\); the rest was filled from other elements\.$/m
    );
  });

  test('a pool that is too small warns and keeps the cube size', () => {
    const cards = catalog({ spells: 0, sites: 0, colourless: 5, rarity: 'Ordinary' });
    for (const randomizeCopies of [true, false]) {
      const res = buildPool({ cards, cubeSize: 360, randomizeCopies, rng: mulberry32(1) });
      expect(res.totalAdded).toBe(20);
      expect(res.cubeSize).toBe(360);
      expect(res.warning).toBe('Could only generate 20/360 cards with current settings');
    }
  });

  test('no sites at all: no spurious "sites ran out" notes', () => {
    const cards = catalog({ sites: 0 });
    const res = buildPool({ cards, cubeSize: 360, rng: mulberry32(6) });
    expect(res.totalAdded).toBe(360);
    expect(res.notes.filter((n) => n.includes('sites'))).toEqual([]);
  });

  test('up-front avatars count toward the size and get one copy', () => {
    const upfront = [1, 2, 3].map((n) => fake(`avatar-${n}`, { type: 'Avatar', rarity: null }));
    const res = buildPool({ cards: catalog(), upfront, cubeSize: 30, rng: mulberry32(3) });
    expect(res.totalAdded).toBe(30);
    for (const a of upfront) expect(res.pool[a.id]).toBe(1);
  });

  test('avatars in the draw get one copy in both modes', () => {
    const avatars = [1, 2, 3, 4, 5].map((n) =>
      fake(`avatar-${n}`, { type: 'Avatar', rarity: 'Elite' })
    );
    for (const randomizeCopies of [true, false]) {
      const res = buildPool({
        cards: avatars,
        cubeSize: 30,
        randomizeCopies,
        rng: mulberry32(5)
      });
      expect(res.totalAdded).toBe(5);
      for (const a of avatars) expect(res.pool[a.id]).toBe(1);
    }
  });

  test('zero size, or more up-front avatars than the size, ends cleanly', () => {
    expect(buildPool({ cards: catalog(), cubeSize: 0, rng: mulberry32(1) }).totalAdded).toBe(0);
    const upfront = [1, 2, 3].map((n) => fake(`avatar-${n}`, { type: 'Avatar', rarity: null }));
    const res = buildPool({ cards: catalog(), upfront, cubeSize: 2, rng: mulberry32(1) });
    expect(res.totalAdded).toBe(3);
    expect(res.warning).toBeNull();
  });

  test('an rng stuck at 0 still terminates and fills exactly', () => {
    const res = buildPool({ cards: catalog(), cubeSize: 200, rng: () => 0 });
    expect(res.totalAdded).toBe(200);
    for (const q of Object.values(res.pool)) expect(q).toBeGreaterThanOrEqual(1);
  });

  test('defaults are copies on and fully random', () => {
    // Copies on never overshoots; copies off would hit a multiple of 4 here.
    const res = buildPool({
      cards: catalog({ rarity: 'Ordinary' }),
      cubeSize: 10,
      rng: mulberry32(1)
    });
    expect(res.totalAdded).toBe(10);
    expect(res.cubeSize).toBe(10);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/cube-pool.spec.js --reporter=line`
Expected: FAIL with `buildPool is not a function` or an import error. The Task 1 tests are unaffected.

- [ ] **Step 3: Implement `buildPool`**

Append to `src/lib/server/cubePool.js`:

```js
/**
 * Splits `total` into integers proportional to `raw` (largest-remainder), so
 * the parts sum exactly. Zero entries never receive a remainder unit.
 */
function largestRemainder(raw, total) {
  const parts = raw.map((r) => Math.floor(r));
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => [r - Math.floor(r), i])
    .filter(([, i]) => raw[i] > 0)
    .sort((a, b) => b[0] - a[0]);
  for (let j = 0; j < order.length && left > 0; j++, left--) parts[order[j][1]]++;
  return parts;
}

const GROUPS = ['spells', 'sites'];
const groupOf = (card) => (card.type === 'Site' ? 'sites' : 'spells');

/**
 * Builds the random part of a cube pool.
 *
 * Eligible cards are bucketed by type group (sites vs spells) and element class:
 * one bucket per selected element for single-element cards, and one "other"
 * bucket for colourless, multi-element and avatar cards. The budget is split by
 * each group's natural size, then each group's elemental part by the element
 * shares, so sites and spells come out in the same element proportions.
 *
 * The fill loop always serves the bucket furthest below its quota. When a
 * bucket runs dry, its shortfall moves to whichever buckets have room.
 */
export function buildPool({
  cards,
  upfront = [],
  elements = [],
  cubeSize,
  rarities = {},
  randomizeCopies = true,
  elementVariance = VARIANCE_MAX,
  rng = Math.random
}) {
  const els = selectedElements(elements);
  const shares = elementShares(els, elementVariance, rng);
  const target = Math.max(0, Math.floor(Number(cubeSize) || 0));

  const pool = {};
  let totalAdded = 0;
  for (const avatar of upfront) {
    pool[avatar.id] = 1;
    totalAdded += 1;
  }

  const count = (card) => pool[card.id] ?? 0;
  const maxFor = (card) => {
    if (card.type === 'Avatar') return 1;
    const rarity = card.rarity || 'Ordinary';
    // Copies off ignores the custom max on purpose: every card gets the standard count.
    if (!randomizeCopies) return getDefaultMax(rarity);
    return Number(rarities[rarity]?.max ?? getDefaultMax(rarity));
  };

  // --- buckets and quotas ---
  const budget = Math.max(0, target - totalAdded);
  const buckets = [];
  const raw = [];
  for (const group of GROUPS) {
    const inGroup = cards.filter((c) => groupOf(c) === group);
    const byKey = new Map([...els.map((e) => [e, []]), ['other', []]]);
    for (const card of inGroup) {
      const own = cardElements(card);
      const single = card.type !== 'Avatar' && own.length === 1 && els.includes(own[0]);
      byKey.get(single ? own[0] : 'other').push(card);
    }
    const groupBudget = cards.length ? (budget * inGroup.length) / cards.length : 0;
    const otherRaw = inGroup.length
      ? (groupBudget * byKey.get('other').length) / inGroup.length
      : 0;
    const elementalRaw = groupBudget - otherRaw;
    for (const [key, list] of byKey) {
      buckets.push({
        group,
        key,
        all: list,
        cards: shuffle([...list], rng),
        cursor: 0,
        filled: 0,
        quota: 0,
        exhausted: list.length === 0
      });
      raw.push(key === 'other' ? otherRaw : elementalRaw * shares[key]);
    }
  }
  largestRemainder(raw, budget).forEach((q, i) => (buckets[i].quota = q));

  const elementCounts = Object.fromEntries(
    GROUPS.map((g) => [g, Object.fromEntries(els.map((e) => [e, 0]))])
  );

  // --- fill ---
  function nextCard(bucket) {
    for (;;) {
      if (bucket.cursor >= bucket.cards.length) {
        // Copies off: one pass, since each card gets its full count at once.
        if (!randomizeCopies) return null;
        const below = bucket.all.filter((c) => count(c) < maxFor(c));
        if (below.length === 0) return null;
        bucket.cards = shuffle(below, rng);
        bucket.cursor = 0;
      }
      const card = bucket.cards[bucket.cursor++];
      if (count(card) < maxFor(card)) return card;
    }
  }

  const deficit = (b) => b.quota - b.filled;
  const capacity = (b) =>
    randomizeCopies
      ? b.all.reduce((n, c) => n + Math.max(0, maxFor(c) - count(c)), 0)
      : b.cards.slice(b.cursor).reduce((n, c) => n + maxFor(c), 0);

  function pickBucket() {
    const live = buckets.filter((b) => !b.exhausted);
    if (live.length === 0) return null;
    // Furthest below quota first. Once every live bucket has met its quota but
    // the pool is still short (others ran dry), fill from the most room left.
    const best = Math.max(...live.map(deficit));
    const score = best > 0 ? deficit : capacity;
    const top = best > 0 ? best : Math.max(...live.map(capacity));
    const tied = live.filter((b) => score(b) === top);
    return tied[Math.floor(rng() * tied.length)];
  }

  while (totalAdded < target) {
    const bucket = pickBucket();
    if (!bucket) break;
    const card = nextCard(bucket);
    if (!card) {
      bucket.exhausted = true;
      continue;
    }
    const max = maxFor(card);
    const current = count(card);
    const add = randomizeCopies
      ? // At least 1, so an rng that returns 0 still makes progress.
        Math.min(Math.max(1, Math.ceil(rng() * (max - current))), target - totalAdded)
      : max; // never truncated: the pool may overshoot by up to 3
    pool[card.id] = current + add;
    bucket.filled += add;
    totalAdded += add;
    if (bucket.key !== 'other') elementCounts[bucket.group][bucket.key] += add;
  }

  // --- results ---
  const notes = [];
  for (const b of buckets) {
    if (b.key !== 'other' && b.exhausted && b.filled < b.quota) {
      notes.push(
        `${b.key} ${b.group} ran out of eligible cards (got ${b.filled} of ${b.quota}); the rest was filled from other elements.`
      );
    }
  }

  let finalSize = target;
  let warning = null;
  if (totalAdded > target && !randomizeCopies) {
    notes.unshift(
      `Pool is ${totalAdded} (was ${target}): cube size rounded up to fit the last card at full copies.`
    );
    finalSize = totalAdded;
  } else if (totalAdded < target) {
    warning = `Could only generate ${totalAdded}/${target} cards with current settings`;
  }

  return { pool, totalAdded, cubeSize: finalSize, warning, notes, elementCounts, shares };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx playwright test tests/cube-pool.spec.js --reporter=line`
Expected: all tests PASS.

If a **balance** test fails, print the failing seed's `res.shares`, `elementCounts` and bucket quotas before changing anything:

- If the planned shares themselves are off, the bug is in the quota maths.
- If the shares are right but the counts drift, the bug is in the fill loop.

Don't loosen a tolerance without recording a `Ruling:` that explains why the new tolerance still proves the property.

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/lib/server/cubePool.js tests/cube-pool.spec.js
git add src/lib/server/cubePool.js tests/cube-pool.spec.js
git commit -m "feat: balance cube pools by element with a copy-count toggle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Wire the generate endpoint to `buildPool`

**Files:**

- Modify: `src/routes/api/cubes/[id]/generate/+server.js` (whole file)
- Test: `tests/cube-generator.spec.js` (create)

**Interfaces:**

- Consumes: `buildPool`, `normalizeSettings` and `passesElementFilter` from `$lib/server/cubePool.js`; `BASIC_SITE_COPIES`, `basicSitesFor` and `isBasicSite` from `$lib/server/basicSites.js`.
- Produces (HTTP): `POST /api/cubes/:id/generate` returns `{ success: true, poolSize, cubeSize, warning, notes, elementCounts }`. It writes `settings.cubeSize` on overshoot.
- Produces (tests, top of `tests/cube-generator.spec.js`):
  - `generate(page, name, settings)` returns `{ id, slug, res, qty }`
  - `savedSettings(cubeId)` reads `cubes.settings` from `data/e2e.db`
  - `colourlessIds()` returns a `Set` of colourless card ids from `data/e2e.db`

- [ ] **Step 1: Write the failing E2E tests**

`tests/cube-generator.spec.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/cube-generator.spec.js --reporter=line`
Expected: FAIL. On the current code an Air-only pool contains **no** colourless card (the `["None"]` bug), so the first test fails on `toBeGreaterThan(0)`.

The suite is serial, so the later tests "did not run". Run them individually with `-g "copies off"` and `-g "without the new keys"`:

- "copies off" must fail too: the old code truncates, so the pool is exactly 30, with no `cubeSize` and no `notes`.
- "without the new keys" fails on `cube.res.notes` being undefined.

- [ ] **Step 3: Rewrite the endpoint**

`src/routes/api/cubes/[id]/generate/+server.js` (complete file):

```js
import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { cubes, cubeCards, cards, cardImages } from '$lib/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { BASIC_SITE_COPIES, basicSitesFor, isBasicSite } from '$lib/server/basicSites.js';
import { buildPool, normalizeSettings, passesElementFilter } from '$lib/server/cubePool.js';

/**
 * Generates a cube's pool from its saved settings. This handler loads and
 * filters the catalog and persists the result; every generation rule (shuffle,
 * element balance, copy counts) lives in $lib/server/cubePool.js.
 */

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, params }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const cube = await db.query.cubes.findFirst({
    where: and(eq(cubes.id, parseInt(params.id)), eq(cubes.user_id, session.user.id))
  });

  if (!cube) return json({ error: 'Cube not found' }, { status: 404 });

  const settings = cube.settings ? JSON.parse(cube.settings) : {};
  const {
    sets: allowedSets = [],
    elements: allowedElements = [],
    rarities = {},
    cubeSize = 360,
    includeAvatars = false,
    includeAllAvatars = false
  } = settings;
  const { randomizeCopies, elementVariance } = normalizeSettings(settings);
  const target = Number(cubeSize);

  // Basic sites stay out of the draw: they are added afterwards at a fixed
  // count and don't use up the cube size.
  const catalog = await db.select().from(cards);
  const catalogIds = new Set(catalog.map((c) => c.id));
  let allCards = catalog.filter((c) => !isBasicSite(c.id));

  // Get all card images so we can filter out Box_Topper-only cards per set
  const allImages = await db.select().from(cardImages);

  // Filter by sets — check if any of the card's sets match the allowed sets
  // AND the card has at least one non-Box_Topper variant in that set
  if (allowedSets.length > 0) {
    allCards = allCards.filter((c) => {
      const cardSets = JSON.parse(c.set_ids || '[]');
      const setsToCheck = cardSets.length > 0 ? cardSets : [c.set_id];

      // Card must be in at least one allowed set
      const matchingSets = setsToCheck.filter((s) => allowedSets.includes(s));
      if (matchingSets.length === 0) return false;

      // Card must have at least one non-Box_Topper image in one of the matching sets
      const hasNonBoxTopper = allImages.some(
        (img) =>
          img.card_id === c.id &&
          matchingSets.includes(img.set_id) &&
          !img.art_type.includes('Box_Topper')
      );

      return hasNonBoxTopper;
    });
  }

  // Colourless cards are stored as ["None"]; they stay eligible whatever
  // elements are selected. Multi-element cards need every element selected.
  allCards = allCards.filter((c) => passesElementFilter(c, allowedElements));

  // Filter by rarities (only include enabled rarities)
  const enabledRarities = Object.keys(rarities).filter((r) => rarities[r]?.enabled !== false);
  if (enabledRarities.length > 0) {
    allCards = allCards.filter((c) => c.type === 'Avatar' || enabledRarities.includes(c.rarity));
  }

  // Avatars: every one up front (1 each), into the draw, or none at all.
  let upfront = [];
  if (!includeAvatars) {
    allCards = allCards.filter((c) => c.type !== 'Avatar');
  } else if (includeAllAvatars) {
    upfront = allCards.filter((c) => c.type === 'Avatar');
    allCards = allCards.filter((c) => c.type !== 'Avatar');
  }

  const result = buildPool({
    cards: allCards,
    upfront,
    elements: allowedElements,
    cubeSize: target,
    rarities,
    randomizeCopies,
    elementVariance
  });

  // Add the basic site of every allowed element, regardless of the set filter.
  // They don't count toward the cube size.
  const pool = { ...result.pool };
  for (const basicId of basicSitesFor(allowedElements)) {
    if (catalogIds.has(basicId)) pool[basicId] = BASIC_SITE_COPIES;
  }

  // Clear existing cube cards and insert new pool
  await db.delete(cubeCards).where(eq(cubeCards.cube_id, cube.id));

  for (const [cardId, quantity] of Object.entries(pool)) {
    await db.insert(cubeCards).values({
      cube_id: cube.id,
      card_id: cardId,
      quantity
    });
  }

  // An overshoot (copies off) becomes the saved size, in the same update that
  // stamps updated_at, so the settings describe the pool they produced.
  const update = { updated_at: new Date().toISOString() };
  if (result.cubeSize !== target) {
    update.settings = JSON.stringify({ ...settings, cubeSize: result.cubeSize });
  }
  await db.update(cubes).set(update).where(eq(cubes.id, cube.id));

  return json({
    success: true,
    poolSize: result.totalAdded,
    cubeSize: result.cubeSize,
    warning: result.warning,
    notes: result.notes,
    elementCounts: result.elementCounts
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx playwright test tests/cube-generator.spec.js tests/cube-basics.spec.js tests/cube-pool.spec.js --reporter=line`
Expected: all PASS. `cube-basics.spec.js` must still pass unchanged.

- [ ] **Step 5: Build, format, commit**

```bash
npm run build && npx prettier --write "src/routes/api/cubes/[id]/generate/+server.js" tests/cube-generator.spec.js && npx prettier --check src tests
git add "src/routes/api/cubes/[id]/generate/+server.js" tests/cube-generator.spec.js
git commit -m "feat: generate cube pools with element balance and copy toggle

Also keeps colourless cards (stored as [\"None\"]) eligible when an element
filter is set; previously any element filter dropped all of them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Edit page controls, breakdown and notes

**Files:**

- Modify: `src/routes/cubes/[slug]/edit/+page.svelte`
- Test: `tests/cube-generator.spec.js` (append)

**Interfaces:**

- Consumes: the HTTP response from Task 3, and the `generate`/`savedSettings` helpers in the spec file.
- Produces, in the DOM:
  - a checkbox labelled **Randomize copy counts**
  - `.max-input` ×4, disabled when copies are off
  - `.copies-hint` (shown when copies are off)
  - a range input labelled **Element variance** (`#element-variance`)
  - `.gen-breakdown` and `.gen-notes` after Generate
  - the existing `.size-input`, buttons **Save Settings** and **Generate Cube Pool**, and element chips as buttons named `Air`/`Earth`/`Fire`/`Water`

- [ ] **Step 1: Write the failing UI tests**

Add `import { gotoHydrated } from './helpers/hydration.js';` to the imports of `tests/cube-generator.spec.js`, then append:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test tests/cube-generator.spec.js --reporter=line -g "edit page controls"`
Expected: FAIL. `getByLabel('Randomize copy counts')` is not found.

- [ ] **Step 3: Update the script**

In `src/routes/cubes/[slug]/edit/+page.svelte`, in the `settings` seed object, add these two lines after `includeAllAvatars`:

```js
      // `??`, not `||`: a saved `false` must stay false. Missing keys (cubes saved
      // before these settings existed) fall back to the generator's defaults.
      randomizeCopies: data.cube.settings.randomizeCopies ?? true,
      elementVariance: data.cube.settings.elementVariance ?? 100,
```

Directly after the line `const rarityNames = ['Ordinary', 'Exceptional', 'Elite', 'Unique'];`
add the block below. It must come after that line, because `formatBreakdown` reads the
`elements` constant declared just above it.

```js
let genNotes = $state([]);
let genBreakdown = $state('');

/** "Air 72 · Earth 68 · Fire 81 · Water 75 (sites 12 / 11 / 14 / 13)" */
function formatBreakdown(counts) {
  if (!counts) return '';
  const els = elements.filter((el) => el in counts.spells);
  const spells = els.map((el) => `${el} ${counts.spells[el]}`).join(' · ');
  const sites = els.map((el) => counts.sites[el]).join(' / ');
  return `${spells} (sites ${sites})`;
}
```

In `generatePool()`, replace the line `genResult = '';` at the top with:

```js
genResult = '';
genNotes = [];
genBreakdown = '';
```

and replace the `if (res.ok) { genResult = …` line with:

```js
    if (res.ok) {
      genResult = `Generated cube with ${json.poolSize} cards!`;
      genNotes = json.notes ?? [];
      genBreakdown = formatBreakdown(json.elementCounts);
      // An overshoot saved a bigger size server-side; adopt it, or the next
      // Save/Generate would PATCH the old size back.
      if (json.cubeSize && json.cubeSize !== settings.cubeSize) {
        settings.cubeSize = json.cubeSize;
      }
```

The `if (json.warning) { … }` block that follows stays as it is.

- [ ] **Step 4: Update the markup**

In the **Elements** section, after the closing `</div>` of `.chip-grid`, add:

```svelte
<div class="variance">
  <label for="element-variance">Element variance: {settings.elementVariance}%</label>
  <input
    id="element-variance"
    type="range"
    min="30"
    max="100"
    step="5"
    bind:value={settings.elementVariance}
    disabled={settings.elements.length === 1}
  />
  <div class="variance-ends">
    <span>30% (near even)</span>
    <span>100% (fully random)</span>
  </div>
  <p class="hint">
    How far each element's share can stray from an even split. Colourless and multi-element cards
    aren't affected.
  </p>
</div>
```

In the **Rarities & Max Copies** section, directly after its `<p>Toggle rarities…</p>`, add:

```svelte
<label class="rarity-toggle randomize-toggle">
  <input type="checkbox" bind:checked={settings.randomizeCopies} />
  <span>Randomize copy counts</span>
</label>
{#if !settings.randomizeCopies}
  <p class="hint copies-hint">
    Every card gets standard copies: 4 Ordinary, 3 Exceptional, 2 Elite, 1 Unique. The cube size may
    round up by a few cards to fit the last card.
  </p>
{/if}
```

On the existing Max `<input type="number" class="input max-input" …>`, add the attribute:

```svelte
disabled={!settings.randomizeCopies}
```

After the existing `{#if genResult}…{/if}` block, add:

```svelte
{#if genBreakdown}
  <p class="gen-breakdown">{genBreakdown}</p>
{/if}
{#if genNotes.length > 0}
  <ul class="gen-notes">
    {#each genNotes as note}
      <li>{note}</li>
    {/each}
  </ul>
{/if}
```

Add to `<style>` (after `.max-input`):

```css
/* The app has no global disabled styling, so make greyed-out inputs look it. */
.max-input:disabled,
.variance input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.randomize-toggle {
  margin-bottom: 0.75rem;
}
.hint {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.variance {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 1rem;
  font-size: 0.85rem;
}
.variance-ends {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.gen-breakdown {
  margin-top: 0.5rem;
  font-size: 0.85rem;
}
.gen-notes {
  margin: 0.5rem 0 0;
  padding-left: 1.2rem;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
```

- [ ] **Step 5: Check the component with the Svelte MCP autofixer**

Run `mcp__svelte__svelte-autofixer` on the full `src/routes/cubes/[slug]/edit/+page.svelte`. Fix anything it reports and re-run until it's clean.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx playwright test tests/cube-generator.spec.js --reporter=line`
Expected: all PASS.

- [ ] **Step 7: Build, format, commit**

```bash
npm run build && npx prettier --write "src/routes/cubes/[slug]/edit/+page.svelte" tests/cube-generator.spec.js && npx prettier --check src tests
git add "src/routes/cubes/[slug]/edit/+page.svelte" tests/cube-generator.spec.js
git commit -m "feat: copy-count toggle and element variance slider on the cube editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Read the build output for Svelte warnings in the edit page, especially `state_referenced_locally`.

---

### Task 5: Docs and full verification

**Files:**

- Modify: `CLAUDE.md` (new subsection under `## Architecture`, after `### Trade list`)

- [ ] **Step 1: Add the CLAUDE.md section**

```markdown
### Cube generation

`POST /api/cubes/[id]/generate` loads and filters the catalog; every generation rule
lives in the pure, DB-free `src/lib/server/cubePool.js` (`buildPool`), which takes an
injectable `rng` so `tests/cube-pool.spec.js` can seed it.

- **Colourless cards are stored as `elements = ["None"]`, not `[]`.** Use
  `cardElements()` / `passesElementFilter()` rather than reading `elements` directly —
  checking `length === 0` silently treats every colourless card as an element card.
- Settings `randomizeCopies` (default `true`) and `elementVariance` (30–100, default 100) live in `cubes.settings`; read them with `??` (via `normalizeSettings`), never
  `||`, or a saved `false` turns back into `true`.
- Copies off uses the standard 4/3/2/1 regardless of the per-rarity max, never
  truncates, and may overshoot the size by up to 3 — the endpoint then saves the new
  `cubeSize`, and the edit page adopts it from the response.
- Shuffle with `shuffle()` (Fisher–Yates), never `sort(() => Math.random() - 0.5)`,
  which is biased toward the input order.
- Basic sites (`basicSites.js`) are added after `buildPool` and are outside every count.
```

- [ ] **Step 2: Run the whole suite, build and format check**

Run: `npm test && npm run build && npm run format:check`
Expected:

- every spec passes, including the pre-existing `cube-basics.spec.js` and `api-keys.spec.js`;
- the build is clean with no new Svelte warnings;
- Prettier reports no issues outside git-ignored scratch files.

- [ ] **Step 3: Smoke-test against the real database**

Some bugs only reproduce against `data/sorcery.db`, so check against it without touching existing cubes:

1. Start a temporary dev server: `npx vite dev --port 5181 --strictPort` (in the background).
2. Mint a cookie with `node scripts/dev-login.js` and use its `Cookie:` line with curl.
3. Create a throwaway cube with `POST /api/cubes {"name":"zz smoke"}`.
4. PATCH its settings to `{ "cubeSize": 360, "elementVariance": 30, "randomizeCopies": false }`.
5. POST generate. Confirm:
   - `poolSize` is 360–363;
   - every element in `elementCounts.spells` is at least about 17% of their sum;
   - each element's site count is in the same ballpark proportion as its spells.
6. Delete the throwaway cube with `DELETE /api/cubes/:id`.
7. Stop the server.
8. Record the breakdown in the final report.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe cube generation in CLAUDE.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
