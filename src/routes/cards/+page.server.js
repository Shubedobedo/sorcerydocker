import { db } from '$lib/db/index.js';
import { cards, sets, cardImages, collections } from '$lib/db/schema.js';
import { like, eq, and, count, asc, sum } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ url, locals }) {
  const session = await locals.auth();
  const q = url.searchParams.get('q') || '';
  const type = url.searchParams.get('type') || '';
  const element = url.searchParams.get('element') || '';
  const rarity = url.searchParams.get('rarity') || '';
  const set = url.searchParams.get('set') || '';
  const cost = url.searchParams.get('cost') || '';
  const subtype = url.searchParams.get('subtype') || '';
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 24;
  const offset = (page - 1) * limit;

  const conditions = [];

  if (q) {
    conditions.push(like(cards.name, `%${q}%`));
  }
  if (type) {
    conditions.push(eq(cards.type, type));
  }
  if (rarity) {
    conditions.push(eq(cards.rarity, rarity));
  }
  if (set) {
    conditions.push(eq(cards.set_id, set));
  }
  if (cost) {
    conditions.push(eq(cards.cost, parseInt(cost)));
  }
  if (subtype) {
    conditions.push(like(cards.subtype, `%${subtype}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count for pagination
  const [{ total }] = await db
    .select({ total: count() })
    .from(cards)
    .where(where);

  let results = await db
    .select()
    .from(cards)
    .where(where)
    .orderBy(asc(cards.name))
    .limit(element ? 200 : limit) // fetch more if we need to filter by element in JS
    .offset(element ? 0 : offset);

  // Build collection map for logged-in user
  let collectionMap = {};
  if (session?.user?.id) {
    const userCollection = await db
      .select()
      .from(collections)
      .where(eq(collections.user_id, session.user.id));
    for (const item of userCollection) {
      collectionMap[item.card_id] = (collectionMap[item.card_id] || 0) + item.quantity;
    }
  }

  // Filter by element in JS since it's stored as JSON array
  if (element) {
    results = results.filter((card) => {
      const elems = JSON.parse(card.elements || '[]');
      return elems.includes(element);
    });
    // Apply pagination manually after filtering
    const totalFiltered = results.length;
    results = results.slice(offset, offset + limit);
    // Override total for element filtering
    return {
      cards: results,
      filters: { q, type, element, rarity, set, cost, subtype },
      page,
      totalPages: Math.ceil(totalFiltered / limit),
      totalCards: totalFiltered,
      allSets: await db.select().from(sets).orderBy(asc(sets.name)),
      collectionMap
    };
  }

  // Get first image for each card for the grid
  const cardIds = results.map((c) => c.id);
  const images = cardIds.length > 0
    ? await db
        .select()
        .from(cardImages)
        .where(like(cardImages.art_type, 'standard%'))
    : [];

  // Map first image per card
  const imageMap = {};
  for (const img of images) {
    if (!imageMap[img.card_id]) {
      imageMap[img.card_id] = img.image_url;
    }
  }

  // Attach image to cards
  const cardsWithImages = results.map((card) => ({
    ...card,
    image_url: imageMap[card.id] || null
  }));

  return {
    cards: cardsWithImages,
    filters: { q, type, element, rarity, set, cost, subtype },
    page,
    totalPages: Math.ceil(total / limit),
    totalCards: total,
    allSets: await db.select().from(sets).orderBy(asc(sets.name)),
    collectionMap
  };
}
