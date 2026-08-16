import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { cards, cardImages } from '$lib/db/schema.js';
import { like, eq, and, asc } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
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

  if (q) conditions.push(like(cards.name, `%${q}%`));
  if (type) conditions.push(eq(cards.type, type));
  if (rarity) conditions.push(eq(cards.rarity, rarity));
  if (set) conditions.push(eq(cards.set_id, set));
  if (cost) conditions.push(eq(cards.cost, parseInt(cost)));
  if (subtype) conditions.push(like(cards.subtype, `%${subtype}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  let results = await db
    .select()
    .from(cards)
    .where(where)
    .orderBy(asc(cards.name))
    .limit(element ? 500 : limit)
    .offset(element ? 0 : offset);

  // Filter by element in JS
  if (element) {
    results = results.filter((card) => {
      const elems = JSON.parse(card.elements || '[]');
      return elems.includes(element);
    });
    results = results.slice(offset, offset + limit);
  }

  // Get first standard image for each card
  const images = await db
    .select()
    .from(cardImages)
    .where(like(cardImages.art_type, 'standard%'));

  const imageMap = {};
  for (const img of images) {
    if (!imageMap[img.card_id]) {
      imageMap[img.card_id] = img.image_url;
    }
  }

  const cardsWithImages = results.map((card) => ({
    ...card,
    image_url: imageMap[card.id] || null
  }));

  return json({
    cards: cardsWithImages,
    hasMore: results.length === limit
  });
}
