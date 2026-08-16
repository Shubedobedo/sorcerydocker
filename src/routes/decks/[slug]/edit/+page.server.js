import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { decks, deckCards, cards, cardImages } from '$lib/db/schema.js';
import { eq, and, like } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, params }) {
  const session = await locals.auth();

  if (!session?.user) {
    throw redirect(303, '/login');
  }

  const deck = await db.query.decks.findFirst({
    where: and(eq(decks.slug, params.slug), eq(decks.user_id, session.user.id))
  });

  if (!deck) {
    throw redirect(303, '/decks');
  }

  // Get deck cards with full card data
  const deckCardRows = await db
    .select()
    .from(deckCards)
    .where(eq(deckCards.deck_id, deck.id));

  // Fetch full card details for each
  const cardIds = [...new Set(deckCardRows.map((dc) => dc.card_id))];
  const cardDetails = cardIds.length > 0
    ? await db.select().from(cards).where(
        // Simple approach: fetch all and filter
        eq(cards.id, cardIds[0]) // placeholder - we'll get all cards for the deck
      )
    : [];

  // Actually get all cards in the deck
  const allDeckCards = [];
  for (const dc of deckCardRows) {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, dc.card_id) });
    if (card) {
      // Get first standard image
      const img = await db.query.cardImages.findFirst({
        where: and(eq(cardImages.card_id, card.id), like(cardImages.art_type, 'standard%'))
      });
      allDeckCards.push({
        ...dc,
        card: { ...card, image_url: img?.image_url || null }
      });
    }
  }

  const atlas = allDeckCards.filter((dc) => dc.zone === 'atlas');
  const spellbook = allDeckCards.filter((dc) => dc.zone === 'spellbook');

  return {
    deck,
    atlas,
    spellbook,
    session
  };
}
