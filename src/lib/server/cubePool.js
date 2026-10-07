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
