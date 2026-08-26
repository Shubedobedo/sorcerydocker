import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { collections, cards, cardImages, sets, trades } from '$lib/db/schema.js';
import { eq, and, like, asc } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  const session = await locals.auth();

  if (!session?.user) {
    throw redirect(303, '/login');
  }

  const userCollection = await db
    .select()
    .from(collections)
    .where(eq(collections.user_id, session.user.id));

  // Enrich with card data
  const enriched = [];
  for (const item of userCollection) {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, item.card_id) });
    if (card) {
      const img = await db.query.cardImages.findFirst({
        where: and(eq(cardImages.card_id, card.id), like(cardImages.art_type, 'standard%'))
      });
      enriched.push({
        ...item,
        card: { ...card, image_url: img?.image_url || null }
      });
    }
  }

  // Sort by card name
  enriched.sort((a, b) => a.card.name.localeCompare(b.card.name));

  const allSets = await db.select().from(sets).orderBy(asc(sets.name));

  // Load trade binder quantities (available trades) for the extra filter
  const userTrades = await db.select().from(trades)
    .where(and(eq(trades.user_id, session.user.id), eq(trades.status, 'available')));

  // Build a map of card_id -> total trade quantity
  const tradeMap = {};
  for (const t of userTrades) {
    tradeMap[t.card_id] = (tradeMap[t.card_id] || 0) + t.quantity;
  }

  return {
    collection: enriched,
    allSets,
    tradeMap,
    session
  };
}
