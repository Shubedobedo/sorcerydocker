import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { trades, cards, cardImages } from '$lib/db/schema.js';
import { eq, and, like, desc } from 'drizzle-orm';
import { loadPriceResolver } from '$lib/server/priceSync.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  const session = await locals.auth();

  if (!session?.user) {
    throw redirect(303, '/login');
  }

  const userTrades = await db
    .select()
    .from(trades)
    .where(eq(trades.user_id, session.user.id))
    .orderBy(desc(trades.created_at));

  const { resolve } = await loadPriceResolver();

  const enriched = [];
  for (const trade of userTrades) {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, trade.card_id) });
    if (card) {
      const img = await db.query.cardImages.findFirst({
        where: and(eq(cardImages.card_id, card.id), like(cardImages.art_type, 'standard%'))
      });
      const price = resolve(trade.card_id, trade.set_name);
      enriched.push({
        ...trade,
        price,
        card: { ...card, image_url: img?.image_url || null }
      });
    }
  }

  const available = enriched.filter((t) => t.status === 'available');
  const archived = enriched.filter((t) => t.status === 'archived');

  const availableValue = available.reduce((sum, t) => sum + (t.price != null ? t.price * t.quantity : 0), 0);

  return {
    available,
    archived,
    availableValue,
    session
  };
}
