/**
 * Basic sites: one per element, and a deck may run any number of copies.
 *
 * Cube generation adds the basic of every element the cube allows, at
 * BASIC_SITE_COPIES, after the random draw. They sit outside the cube: they
 * don't count toward its size or card count, and they never go into packs.
 * Generation, packs and every count read this file so they can't drift.
 */

export const BASIC_SITE_COPIES = 30;

export const BASIC_SITES = {
  Air: 'spire',
  Water: 'stream',
  Earth: 'valley',
  Fire: 'wasteland'
};

const BASIC_SITE_IDS = new Set(Object.values(BASIC_SITES));

export function isBasicSite(cardId) {
  return BASIC_SITE_IDS.has(cardId);
}

/**
 * Card ids of the basics for a cube's element filter. An empty filter allows
 * every element, matching how the generator treats it.
 */
export function basicSitesFor(allowedElements = []) {
  const elements = allowedElements.length > 0 ? allowedElements : Object.keys(BASIC_SITES);
  return elements.map((el) => BASIC_SITES[el]).filter(Boolean);
}
