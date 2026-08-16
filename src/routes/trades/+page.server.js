import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { trades, cards, cardImages } from '$lib/db/schema.js';
import { eq, and, like, desc } from 'drizzle-orm';

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

  const enriched = [];
  for (const trade of userTrades) {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, trade.card_id) });
    if (card) {
      const img = await db.query.cardImages.findFirst({
        where: and(eq(cardImages.card_id, card.id), like(cardImages.art_type, 'standard%'))
      });
      enriched.push({
        ...trade,
        card: { ...card, image_url: img?.image_url || null }
      });
    }
  }

  const available = enriched.filter((t) => t.status === 'available');
  const archived = enriched.filter((t) => t.status === 'archived');

  return {
    available,
    archived,
    session
  };
}
