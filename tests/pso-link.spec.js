import { test, expect } from '@playwright/test';
import { buildPsoLink } from '../src/lib/psoLink.js';
import { decodePsoLink, PSO_PREFIX } from './helpers/psoLink.js';

// buildPsoLink() runs in plain Node here: no page fixture, no browser.

const PREFIX = PSO_PREFIX;

test('round-trips name, avatar, atlas and spellbook', () => {
  const url = buildPsoLink({
    name: 'Fire & Thaïs',
    avatar: { name: 'Sorcerer' },
    atlas: [
      { name: 'Arid Desert', quantity: 4 },
      { name: 'Forge', quantity: 1 }
    ],
    spellbook: [
      { name: 'Courtesan Thaïs', quantity: 2 },
      { name: "Philosopher's Stone", quantity: 1 },
      { name: 'Lightning Bolt', quantity: 4 }
    ]
  });

  expect(decodePsoLink(url)).toEqual({
    n: 'Fire & Thaïs',
    a: [['Sorcerer', 1]],
    t: [
      ['Arid Desert', 4],
      ['Forge', 1]
    ],
    s: [
      ['Courtesan Thaïs', 2],
      ["Philosopher's Stone", 1],
      ['Lightning Bolt', 4]
    ],
    c: []
  });
});

test('the d param carries no raw base64 punctuation', () => {
  // A raw "+" in a query string decodes as a space and breaks the import, so the
  // base64 must be URL-encoded. Enough varied names to make "+", "/" and "="
  // all but certain to appear in the base64.
  const spellbook = Array.from({ length: 40 }, (_, i) => ({
    name: `Cärd ~${i}? ÿ>`,
    quantity: (i % 4) + 1
  }));
  const url = buildPsoLink({ name: 'Punctuation', avatar: null, atlas: [], spellbook });
  const d = url.slice(PREFIX.length);
  const raw = decodeURIComponent(d);
  expect(raw).toMatch(/[+/=]/); // the test only means something if these occurred
  expect(d).not.toMatch(/[+/=]/);
  expect(decodePsoLink(url).s).toHaveLength(40);
});

test('a deck with no avatar or cards still encodes', () => {
  const url = buildPsoLink({ name: 'Empty', avatar: null, atlas: [], spellbook: [] });
  expect(decodePsoLink(url)).toEqual({ n: 'Empty', a: [], t: [], s: [], c: [] });
});

test('a ninety-card deck stays a sensible length', () => {
  const atlas = Array.from({ length: 10 }, (_, i) => ({ name: `Site ${i}`, quantity: 3 }));
  const spellbook = Array.from({ length: 20 }, (_, i) => ({ name: `Spell ${i}`, quantity: 3 }));
  const url = buildPsoLink({ name: 'Big', avatar: { name: 'Sorcerer' }, atlas, spellbook });
  expect(url.length).toBeLessThan(2000);
});
