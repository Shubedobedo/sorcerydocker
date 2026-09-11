/**
 * Fixtures shared by the seed script and the specs.
 *
 * There is no API that lists a cube's pool, so the specs cannot discover these
 * at runtime. The seed inserts them with explicit ids instead, and both sides
 * import this module so they cannot drift apart.
 *
 * Card ids are slugified card names. The avatars named here are Alpha and
 * Promotional printings that have been in the catalog since release; the seed
 * fails loudly if a re-sync ever removes one, rather than silently seeding a
 * cube with no avatar in it.
 */

/** A cube owned by the member user, seeded with a known pool. */
export const CUBE = {
  id: 1,
  name: 'E2E Cube',
  slug: 'e2e-cube'
};

export const AVATARS = {
  /** Seeded INTO the cube's pool. */
  inPool: 'battlemage',
  /** A real avatar deliberately left OUT of the cube's pool. */
  outOfPool: 'sorcerer',
  /** Legal in every deck, cube or not — and never seeded into the pool. */
  spellslinger: 'spellslinger'
};
