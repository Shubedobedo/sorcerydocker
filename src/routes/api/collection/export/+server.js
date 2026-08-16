import { db } from '$lib/db/index.js';
import { cards } from '$lib/db/schema.js';
import { eq, like } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url }) {
  const session = await locals.auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const setFilter = url.searchParams.get('set') || '';

  // Get all cards, optionally filtered by set
  let allCards;
  if (setFilter) {
    // Filter cards that belong to this set (check set_ids JSON array)
    const allCardsRaw = await db.select().from(cards);
    allCards = allCardsRaw.filter((c) => {
      const setIds = JSON.parse(c.set_ids || '[]');
      return setIds.includes(setFilter) || c.set_id === setFilter;
    });
  } else {
    allCards = await db.select().from(cards);
  }

  // Sort by name
  allCards.sort((a, b) => a.name.localeCompare(b.name));

  // Get user's current collection to pre-fill quantities
  const { collections } = await import('$lib/db/schema.js');
  const userCollection = await db.select().from(collections)
    .where(eq(collections.user_id, session.user.id));

  const collectionMap = {};
  for (const item of userCollection) {
    collectionMap[item.card_id] = (collectionMap[item.card_id] || 0) + item.quantity;
  }

  // Build CSV
  const rows = ['card_id,name,type,rarity,set,quantity'];
  for (const card of allCards) {
    const qty = collectionMap[card.id] || 0;
    const name = card.name.replace(/,/g, '');
    rows.push(`${card.id},${name},${card.type || ''},${card.rarity || ''},${card.set_name || ''},${qty}`);
  }

  const csv = rows.join('\n');
  const filename = setFilter ? `collection-${setFilter}.csv` : 'collection-all.csv';

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}
