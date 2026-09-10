import { db } from '$lib/db/index.js';
import { decks, deckCards, cards, friendships } from '$lib/db/schema.js';
import { eq, and } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, params }) {
  const session = await locals.auth();

  const deck = await db.query.decks.findFirst({ where: eq(decks.id, parseInt(params.id)) });
  if (!deck) return new Response('Not found', { status: 404 });

  // Same gate as the deck page's load: 404 rather than 403 so the endpoint does
  // not confirm that a private deck exists at this id.
  const isOwner = session?.user?.id === deck.user_id;
  if (!isOwner && deck.visibility !== 'public') {
    let canView = false;
    if (session?.user?.id && deck.visibility === 'friends') {
      const friendship = await db.query.friendships.findFirst({
        where: and(
          eq(friendships.user_id, deck.user_id),
          eq(friendships.friend_id, session.user.id)
        )
      });
      canView = !!friendship;
    }
    if (!canView) return new Response('Not found', { status: 404 });
  }

  const deckCardRows = await db.select().from(deckCards).where(eq(deckCards.deck_id, deck.id));

  const atlas = [];
  const spellbook = [];

  for (const dc of deckCardRows) {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, dc.card_id) });
    if (card) {
      const line = `${dc.quantity}x ${card.name}`;
      if (dc.zone === 'atlas') atlas.push(line);
      else spellbook.push(line);
    }
  }

  let text = `// ${deck.name}\n// Format: ${deck.format}\n\n`;
  text += `// Atlas\n${atlas.join('\n')}\n\n`;
  text += `// Spellbook\n${spellbook.join('\n')}\n`;

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain',
      'Content-Disposition': `attachment; filename="${deck.name.replace(/[^a-z0-9]/gi, '_')}.txt"`
    }
  });
}
