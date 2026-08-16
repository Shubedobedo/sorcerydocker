import { db } from '$lib/db/index.js';
import { cards, cardImages, decks, collections } from '$lib/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, locals }) {
  const session = await locals.auth();

  const card = await db.query.cards.findFirst({
    where: eq(cards.slug, params.slug)
  });

  if (!card) {
    throw error(404, 'Card not found');
  }

  const images = await db
    .select()
    .from(cardImages)
    .where(eq(cardImages.card_id, card.id));

  // Get user's decks for "Add to Deck" feature
  let userDecks = [];
  if (session?.user?.id) {
    userDecks = await db
      .select({ id: decks.id, name: decks.name, format: decks.format, slug: decks.slug })
      .from(decks)
      .where(eq(decks.user_id, session.user.id));
  }

  // Get user's collection count for this card
  let ownedCount = 0;
  if (session?.user?.id) {
    const owned = await db
      .select()
      .from(collections)
      .where(and(eq(collections.user_id, session.user.id), eq(collections.card_id, card.id)));
    ownedCount = owned.reduce((sum, item) => sum + item.quantity, 0);
  }

  return {
    card,
    images,
    userDecks,
    ownedCount,
    session
  };
}
