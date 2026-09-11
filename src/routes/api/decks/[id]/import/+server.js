import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { decks, deckCards, cards } from '$lib/db/schema.js';
import { eq, and, like } from 'drizzle-orm';
import { AVATAR_ZONE, isAvatarCard, avatarRejectionReason } from '$lib/server/avatars.js';

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
    if (
      trimmed.toLowerCase().includes('// atlas') ||
      trimmed.toLowerCase() === 'atlas' ||
      trimmed.toLowerCase() === 'atlas:'
    ) {
      currentZone = 'atlas';
      continue;
    }
    if (
      trimmed.toLowerCase().includes('// spellbook') ||
      trimmed.toLowerCase() === 'spellbook' ||
      trimmed.toLowerCase() === 'spellbook:'
    ) {
      currentZone = 'spellbook';
      continue;
    }
    if (
      trimmed.toLowerCase().includes('// avatar') ||
      trimmed.toLowerCase() === 'avatar' ||
      trimmed.toLowerCase() === 'avatar:'
    ) {
      currentZone = AVATAR_ZONE;
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

    // Auto-detect zone by card type. Avatars used to fall through to the
    // spellbook here, which silently put them in the wrong zone.
    let zone = currentZone;
    if (found.type === 'Site') zone = 'atlas';
    else if (isAvatarCard(found)) zone = AVATAR_ZONE;

    if (zone === AVATAR_ZONE) {
      // An illegal avatar is skipped rather than failing the import, matching how
      // unmatched card names behave.
      if (await avatarRejectionReason(deck, found.id)) {
        skipped++;
        continue;
      }
      // Exactly one avatar: a later line replaces an earlier one.
      await db
        .delete(deckCards)
        .where(and(eq(deckCards.deck_id, deck.id), eq(deckCards.zone, AVATAR_ZONE)));
      await db
        .insert(deckCards)
        .values({ deck_id: deck.id, card_id: found.id, zone: AVATAR_ZONE, quantity: 1 });
      imported++;
      continue;
    }

    // Check if already in deck
    const existing = await db.query.deckCards.findFirst({
      where: and(
        eq(deckCards.deck_id, deck.id),
        eq(deckCards.card_id, found.id),
        eq(deckCards.zone, zone)
      )
    });

    if (existing) {
      await db
        .update(deckCards)
        .set({ quantity: existing.quantity + quantity })
        .where(eq(deckCards.id, existing.id));
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
