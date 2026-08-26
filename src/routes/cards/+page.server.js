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
  const multiTypes = type ? type.split(',').filter(Boolean) : [];
  const multiRarities = rarity ? rarity.split(',').filter(Boolean) : [];
  const multiSets = set ? set.split(',').filter(Boolean) : [];
  const needsJsFilter = multiTypes.length > 1 || multiRarities.length > 1 || multiSets.length > 1 || element;

  if (q) {
    conditions.push(like(cards.name, `%${q}%`));
  }
  if (multiTypes.length === 1) {
    conditions.push(eq(cards.type, multiTypes[0]));
  }
  if (multiRarities.length === 1) {
    conditions.push(eq(cards.rarity, multiRarities[0]));
  }
  if (multiSets.length === 1) {
    conditions.push(like(cards.set_ids, `%"${multiSets[0]}"%`));
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
    .limit(needsJsFilter ? 2000 : limit)
    .offset(needsJsFilter ? 0 : offset);

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

  // Apply JS-side filters for multi-values and element
  if (multiTypes.length > 1) {
    results = results.filter((card) => multiTypes.includes(card.type));
  }
  if (multiRarities.length > 1) {
    results = results.filter((card) => multiRarities.includes(card.rarity));
  }
  if (multiSets.length > 1) {
    results = results.filter((card) => {
      const cardSets = JSON.parse(card.set_ids || '[]');
      return multiSets.some((s) => cardSets.includes(s));
    });
  }
  if (element) {
    const multiElements = element.split(',').filter(Boolean);
    results = results.filter((card) => {
      const elems = JSON.parse(card.elements || '[]');
      return multiElements.some((el) => elems.includes(el));
    });
  }

  // If we did JS-side filtering, apply pagination manually
  if (needsJsFilter) {
    const totalFiltered = results.length;
    results = results.slice(offset, offset + limit);

    // Get images for filtered results
    const filteredImageMap = {};
    for (const card of results) {
      const img = await db.query.cardImages.findFirst({
        where: and(eq(cardImages.card_id, card.id), like(cardImages.art_type, 'standard%'))
      });
      if (img) filteredImageMap[card.id] = img.image_url;
    }
    const filteredWithImages = results.map((card) => ({
      ...card,
      image_url: filteredImageMap[card.id] || null
    }));

    return {
      cards: filteredWithImages,
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
