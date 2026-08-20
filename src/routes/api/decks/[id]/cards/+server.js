import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { decks, deckCards, cubeCards } from '$lib/db/schema.js';
import { eq, and } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, request, params }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const deck = await db.query.decks.findFirst({
    where: and(eq(decks.id, parseInt(params.id)), eq(decks.user_id, session.user.id))
  });

  if (!deck) return json({ error: 'Deck not found' }, { status: 404 });

  const { card_id, zone, quantity } = await request.json();

  if (!card_id || !zone) {
    return json({ error: 'card_id and zone are required' }, { status: 400 });
  }

  if (!['atlas', 'spellbook'].includes(zone)) {
    return json({ error: 'Zone must be atlas or spellbook' }, { status: 400 });
  }

  // Cube format validation: card must be in cube pool and quantity can't exceed pool amount
  if (deck.format === 'cube' && deck.cube_id) {
    const cubeCard = await db.query.cubeCards.findFirst({
      where: and(
        eq(cubeCards.cube_id, deck.cube_id),
        eq(cubeCards.card_id, card_id)
      )
    });

    if (!cubeCard) {
      return json({ error: 'Card is not in this cube pool', warning: true }, { status: 422 });
    }

    // Calculate what the new total quantity would be across all zones
    const existingInAllZones = await db
      .select()
      .from(deckCards)
      .where(and(eq(deckCards.deck_id, deck.id), eq(deckCards.card_id, card_id)));

    const currentTotal = existingInAllZones.reduce((sum, dc) => sum + dc.quantity, 0);
    const existingInZone = existingInAllZones.find((dc) => dc.zone === zone);

    // Determine new quantity
    let newQty;
    if (existingInZone) {
      newQty = (quantity !== undefined) ? quantity : existingInZone.quantity + 1;
    } else {
      newQty = quantity || 1;
    }

    // Total across zones after this change
    const totalAfter = currentTotal - (existingInZone?.quantity || 0) + newQty;

    if (newQty > 0 && totalAfter > cubeCard.quantity) {
      return json({
        error: `Exceeds cube pool limit. Pool has ${cubeCard.quantity}x of this card.`,
        poolQuantity: cubeCard.quantity,
        currentTotal,
        warning: true
      }, { status: 422 });
    }
  }

  // Check if card already exists in this zone
  const existing = await db.query.deckCards.findFirst({
    where: and(
      eq(deckCards.deck_id, deck.id),
      eq(deckCards.card_id, card_id),
      eq(deckCards.zone, zone)
    )
  });

  if (existing) {
    // Update quantity
    const newQty = (quantity !== undefined) ? quantity : existing.quantity + 1;
    if (newQty <= 0) {
      await db.delete(deckCards).where(eq(deckCards.id, existing.id));
    } else {
      await db.update(deckCards).set({ quantity: newQty }).where(eq(deckCards.id, existing.id));
    }
  } else {
    await db.insert(deckCards).values({
      deck_id: deck.id,
      card_id,
      zone,
      quantity: quantity || 1
    });
  }

  // Update deck timestamp
  await db.update(decks).set({ updated_at: new Date().toISOString() }).where(eq(decks.id, deck.id));

  return json({ success: true });
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ locals, request, params }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const deck = await db.query.decks.findFirst({
    where: and(eq(decks.id, parseInt(params.id)), eq(decks.user_id, session.user.id))
  });

  if (!deck) return json({ error: 'Deck not found' }, { status: 404 });

  const { card_id, zone } = await request.json();

  await db.delete(deckCards).where(
    and(
      eq(deckCards.deck_id, deck.id),
      eq(deckCards.card_id, card_id),
      eq(deckCards.zone, zone)
    )
  );

  return json({ success: true });
}
