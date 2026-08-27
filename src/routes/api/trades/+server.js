import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { trades, collections, cards, cardImages } from '$lib/db/schema.js';
import { eq, and, like } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, request }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const { card_id, set_id, set_name, quantity, location, expected_value, foil } = await request.json();

  if (!card_id) {
    return json({ error: 'card_id is required' }, { status: 400 });
  }

  // Create the trade listing
  const [trade] = await db.insert(trades).values({
    user_id: session.user.id,
    card_id,
    set_id: set_id || null,
    set_name: set_name || null,
    quantity: quantity || 1,
    foil: foil ? 1 : 0,
    location: location || null,
    expected_value: expected_value || null
  }).returning();

  return json(trade, { status: 201 });
}

/** @type {import('./$types').RequestHandler} */
export async function PATCH({ locals, request }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const { id, location, expected_value, status, foil } = await request.json();

  if (!id) return json({ error: 'id is required' }, { status: 400 });

  const trade = await db.query.trades.findFirst({
    where: and(eq(trades.id, id), eq(trades.user_id, session.user.id))
  });

  if (!trade) return json({ error: 'Trade not found' }, { status: 404 });

  const updates = {};
  if (location !== undefined) updates.location = location;
  if (expected_value !== undefined) updates.expected_value = expected_value;
  if (foil !== undefined) updates.foil = foil ? 1 : 0;

  if (status === 'traded') {
    updates.status = 'archived';
    updates.traded_at = new Date().toISOString();

    // Remove from collection
    const collConditions = [
      eq(collections.user_id, session.user.id),
      eq(collections.card_id, trade.card_id)
    ];
    if (trade.set_id) collConditions.push(eq(collections.set_id, trade.set_id));

    const collEntry = await db.query.collections.findFirst({
      where: and(...collConditions)
    });

    if (collEntry) {
      const newQty = collEntry.quantity - trade.quantity;
      if (newQty <= 0) {
        await db.delete(collections).where(eq(collections.id, collEntry.id));
      } else {
        await db.update(collections).set({ quantity: newQty }).where(eq(collections.id, collEntry.id));
      }
    }
  } else if (status !== undefined) {
    updates.status = status;
    if (status === 'available') {
      updates.traded_at = null;
    }
  }

  await db.update(trades).set(updates).where(eq(trades.id, id));

  return json({ success: true });
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ locals, request }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await request.json();
  await db.delete(trades).where(
    and(eq(trades.id, id), eq(trades.user_id, session.user.id))
  );

  return json({ success: true });
}
