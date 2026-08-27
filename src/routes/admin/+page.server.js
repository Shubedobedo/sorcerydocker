import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { users, cards, cardPrices, appMeta } from '$lib/db/schema.js';
import { desc, eq, count } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  const session = await locals.auth();

  if (!session?.user || session.user.role !== 'admin') {
    throw redirect(303, '/');
  }

  const allUsers = await db.select().from(users);

  // Get last sync time from most recently updated card
  const [lastCard] = await db
    .select({ updated_at: cards.updated_at })
    .from(cards)
    .orderBy(desc(cards.updated_at))
    .limit(1);

  // Last price sync from app_meta, plus a count of price rows
  const priceSyncMeta = await db.query.appMeta.findFirst({
    where: eq(appMeta.key, 'last_price_sync')
  });
  const [priceCount] = await db.select({ total: count() }).from(cardPrices);

  const adminCount = allUsers.filter((u) => u.role === 'admin').length;

  return {
    users: allUsers,
    adminCount,
    lastSync: lastCard?.updated_at || null,
    lastPriceSync: priceSyncMeta?.value || null,
    priceRowCount: priceCount?.total || 0,
    tcgApiConfigured: !!process.env.TCGAPI_KEY,
    session
  };
}
