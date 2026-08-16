import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { collections, cards, cardImages } from '$lib/db/schema.js';
import { eq, and, like } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const userCollection = await db
    .select()
    .from(collections)
    .where(eq(collections.user_id, session.user.id));

  // Enrich with card data
  const enriched = [];
  for (const item of userCollection) {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, item.card_id) });
    if (card) {
      const img = await db.query.cardImages.findFirst({
        where: and(eq(cardImages.card_id, card.id), like(cardImages.art_type, 'standard%'))
      });
      enriched.push({
        ...item,
        card: { ...card, image_url: img?.image_url || null }
      });
    }
  }

  return json(enriched);
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, request }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const { card_id, set_id, set_name, quantity, add } = await request.json();

  if (!card_id) {
    return json({ error: 'card_id is required' }, { status: 400 });
  }

  // Check if entry already exists for this card+set
  const conditions = [
    eq(collections.user_id, session.user.id),
    eq(collections.card_id, card_id)
  ];
  if (set_id) conditions.push(eq(collections.set_id, set_id));

  const existing = await db.query.collections.findFirst({
    where: and(...conditions)
  });

  if (existing) {
    // If 'add' is true, add to existing quantity. Otherwise set to the given quantity.
    const newQty = add
      ? existing.quantity + (quantity || 1)
      : (quantity !== undefined ? quantity : existing.quantity + 1);
    if (newQty <= 0) {
      await db.delete(collections).where(eq(collections.id, existing.id));
      return json({ success: true, removed: true });
    } else {
      await db.update(collections).set({ quantity: newQty }).where(eq(collections.id, existing.id));
      return json({ success: true, quantity: newQty });
    }
  } else {
    await db.insert(collections).values({
      user_id: session.user.id,
      card_id,
      set_id: set_id || null,
      set_name: set_name || null,
      quantity: quantity || 1
    });
    return json({ success: true, quantity: quantity || 1 });
  }
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ locals, request }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const { card_id, set_id } = await request.json();

  const conditions = [
    eq(collections.user_id, session.user.id),
    eq(collections.card_id, card_id)
  ];
  if (set_id) conditions.push(eq(collections.set_id, set_id));

  await db.delete(collections).where(and(...conditions));

  return json({ success: true });
}
