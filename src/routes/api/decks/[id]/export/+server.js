import { db } from '$lib/db/index.js';
import { decks, deckCards, cards } from '$lib/db/schema.js';
import { eq } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params }) {
  const deck = await db.query.decks.findFirst({ where: eq(decks.id, parseInt(params.id)) });
  if (!deck) return new Response('Not found', { status: 404 });

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
