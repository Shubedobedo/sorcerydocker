import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { cubes, cubeCards, cards, cardImages } from '$lib/db/schema.js';
import { eq, and, like } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, request, params }) {
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
    includeAvatars = false
  } = settings;

  // Fetch all cards from the database
  let allCards = await db.select().from(cards);

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

  // Separate avatars from the main pool
  const avatarCards = allCards.filter((c) => c.type === 'Avatar');
  allCards = allCards.filter((c) => c.type !== 'Avatar');

  // Filter by elements — ALL of a card's elements must be in the allowed set
  if (allowedElements.length > 0) {
    allCards = allCards.filter((c) => {
      const cardElements = JSON.parse(c.elements || '[]');
      if (cardElements.length === 0) return true; // colorless/none cards are always allowed
      return cardElements.every((el) => allowedElements.includes(el));
    });
  }

  // Filter by rarities (only include enabled rarities)
  const enabledRarities = Object.keys(rarities).filter((r) => rarities[r]?.enabled !== false);
  if (enabledRarities.length > 0) {
    allCards = allCards.filter((c) => enabledRarities.includes(c.rarity));
  }

  // Build the cube pool by randomly adding copies up to max per rarity until we hit cubeSize
  const pool = {}; // card.id -> quantity
  const cardCounts = {}; // card.id -> current count

  // Shuffle the eligible cards
  const shuffled = [...allCards].sort(() => Math.random() - 0.5);

  let totalAdded = 0;
  let passes = 0;
  const maxPasses = 100; // safety limit

  while (totalAdded < cubeSize && passes < maxPasses) {
    let addedThisPass = 0;

    for (const card of shuffled) {
      if (totalAdded >= cubeSize) break;

      const rarity = card.rarity || 'Ordinary';
      const maxCopies = rarities[rarity]?.max ?? getDefaultMax(rarity);
      const currentCount = cardCounts[card.id] || 0;

      if (currentCount < maxCopies) {
        // Randomly decide how many to add this pass (1 to remaining allowed)
        const remaining = maxCopies - currentCount;
        const spaceLeft = cubeSize - totalAdded;
        const toAdd = Math.min(
          Math.ceil(Math.random() * remaining),
          spaceLeft
        );

        cardCounts[card.id] = currentCount + toAdd;
        pool[card.id] = (pool[card.id] || 0) + toAdd;
        totalAdded += toAdd;
        addedThisPass += toAdd;
      }
    }

    // If we couldn't add anything, all cards are at max
    if (addedThisPass === 0) break;

    // Re-shuffle for next pass for more randomness
    shuffled.sort(() => Math.random() - 0.5);
    passes++;
  }

  // Clear existing cube cards and insert new pool
  await db.delete(cubeCards).where(eq(cubeCards.cube_id, cube.id));

  // If avatars are included, pick one random avatar and add it
  if (includeAvatars && avatarCards.length > 0) {
    const randomAvatar = avatarCards[Math.floor(Math.random() * avatarCards.length)];
    pool[randomAvatar.id] = 1;
    totalAdded += 1;
  }

  for (const [cardId, quantity] of Object.entries(pool)) {
    await db.insert(cubeCards).values({
      cube_id: cube.id,
      card_id: cardId,
      quantity
    });
  }

  await db.update(cubes).set({ updated_at: new Date().toISOString() }).where(eq(cubes.id, cube.id));

  return json({ success: true, poolSize: totalAdded, warning: totalAdded < cubeSize ? `Could only generate ${totalAdded}/${cubeSize} cards with current settings` : null });
}

function getDefaultMax(rarity) {
  switch (rarity) {
    case 'Ordinary': return 4;
    case 'Exceptional': return 3;
    case 'Elite': return 2;
    case 'Unique': return 1;
    default: return 4;
  }
}
