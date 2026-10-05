import { json } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '$lib/db/index.js';
import { cards, trades } from '$lib/db/schema.js';
import { invalidApiKey, requireApiKey } from '$lib/server/apiKeys.js';
import { loadPriceResolver } from '$lib/server/priceSync.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ request }) {
  const userId = await requireApiKey(request);
  if (!userId) return invalidApiKey();

  // Available binder entries only; traded/archived history is not exposed.
  const rows = await db
    .select({
      id: trades.id,
      card_id: trades.card_id,
      name: cards.name,
      set_name: trades.set_name,
      quantity: trades.quantity,
      foil: trades.foil,
      location: trades.location,
      expected_value: trades.expected_value,
      list_quantity: trades.list_quantity
    })
    .from(trades)
    .innerJoin(cards, eq(cards.id, trades.card_id))
    .where(and(eq(trades.user_id, userId), eq(trades.status, 'available')))
    .orderBy(asc(cards.name), asc(trades.id));

  const { resolve } = await loadPriceResolver();
  return json({
    trades: rows.map((t) => ({
      ...t,
      market_price: resolve(t.card_id, t.set_name, t.foil ? 'foil' : 'normal')
    }))
  });
}
