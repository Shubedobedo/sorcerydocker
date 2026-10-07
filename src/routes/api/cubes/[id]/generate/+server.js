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
