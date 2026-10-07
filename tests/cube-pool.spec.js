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
