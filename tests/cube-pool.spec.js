import { test, expect } from '@playwright/test';
import {
  ELEMENTS,
  buildPool,
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
    // Enough sites that no element's site bucket runs dry: when one does, its
    // shortfall moves to other elements by design (tested below), and the split
    // is then expected to differ.
    for (let seed = 1; seed <= 10; seed++) {
      const res = buildPool({
        cards: catalog({ sites: 60 }),
        cubeSize: 360,
        elementVariance: 100,
        rng: mulberry32(seed)
      });
      expect(res.notes, `seed ${seed}`).toEqual([]);
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
