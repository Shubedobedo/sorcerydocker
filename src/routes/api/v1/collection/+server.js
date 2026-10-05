import { json } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/db/index.js';
import { cards, collections } from '$lib/db/schema.js';
import { invalidApiKey, requireApiKey } from '$lib/server/apiKeys.js';
import { loadPriceResolver } from '$lib/server/priceSync.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ request }) {
  const userId = await requireApiKey(request);
  if (!userId) return invalidApiKey();

  const rows = await db
    .select({
      card_id: collections.card_id,
      name: cards.name,
      set_id: collections.set_id,
      set_name: collections.set_name,
      quantity: collections.quantity
    })
    .from(collections)
    .innerJoin(cards, eq(cards.id, collections.card_id))
    .where(eq(collections.user_id, userId))
    .orderBy(asc(cards.name), asc(collections.set_name));

  const { resolve } = await loadPriceResolver();
  return json({
    cards: rows.map((r) => ({ ...r, market_price: resolve(r.card_id, r.set_name) }))
  });
}
