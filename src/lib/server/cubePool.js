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
