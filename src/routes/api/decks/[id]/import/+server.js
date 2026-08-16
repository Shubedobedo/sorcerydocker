import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { decks, deckCards, cards } from '$lib/db/schema.js';
import { eq, and, like } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, request, params }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const deck = await db.query.decks.findFirst({
    where: and(eq(decks.id, parseInt(params.id)), eq(decks.user_id, session.user.id))
  });
  if (!deck) return json({ error: 'Deck not found' }, { status: 404 });

  const text = await request.text();
  const lines = text.trim().split('\n');

  // Clear existing deck cards
  await db.delete(deckCards).where(eq(deckCards.deck_id, deck.id));

  let currentZone = 'spellbook';
  let imported = 0;
  let skipped = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Check for zone headers
    if (trimmed.toLowerCase().includes('// atlas') || trimmed.toLowerCase() === 'atlas' || trimmed.toLowerCase() === 'atlas:') {
      currentZone = 'atlas';
      continue;
    }
    if (trimmed.toLowerCase().includes('// spellbook') || trimmed.toLowerCase() === 'spellbook' || trimmed.toLowerCase() === 'spellbook:') {
      currentZone = 'spellbook';
      continue;
    }

    // Skip comment lines
    if (trimmed.startsWith('//')) continue;

    // Parse "Nx Card Name" or "N Card Name" or just "Card Name"
    const match = trimmed.match(/^(\d+)x?\s+(.+)$/i);
    let quantity = 1;
    let cardName = trimmed;

    if (match) {
      quantity = parseInt(match[1]);
      cardName = match[2].trim();
    }

    // Find card by name (case-insensitive)
    const allCards = await db.select().from(cards);
    const found = allCards.find((c) => c.name.toLowerCase() === cardName.toLowerCase());

    if (!found) {
      skipped++;
      continue;
    }

    // Auto-detect zone for sites
    const zone = found.type === 'Site' ? 'atlas' : currentZone;

    // Check if already in deck
    const existing = await db.query.deckCards.findFirst({
      where: and(eq(deckCards.deck_id, deck.id), eq(deckCards.card_id, found.id), eq(deckCards.zone, zone))
    });

    if (existing) {
      await db.update(deckCards).set({ quantity: existing.quantity + quantity }).where(eq(deckCards.id, existing.id));
    } else {
      await db.insert(deckCards).values({
        deck_id: deck.id,
        card_id: found.id,
        zone,
        quantity
      });
    }
    imported++;
  }

  await db.update(decks).set({ updated_at: new Date().toISOString() }).where(eq(decks.id, deck.id));

  return json({ success: true, imported, skipped });
}
