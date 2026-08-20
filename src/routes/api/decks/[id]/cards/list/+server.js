import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { decks, deckCards } from '$lib/db/schema.js';
import { eq } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, params }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const deck = await db.query.decks.findFirst({
    where: eq(decks.id, parseInt(params.id))
  });

  if (!deck) return json({ error: 'Deck not found' }, { status: 404 });

  // Allow owner to see their deck cards
  if (deck.user_id !== session.user.id) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const cards = await db.select().from(deckCards).where(eq(deckCards.deck_id, deck.id));

  return json(cards);
}
