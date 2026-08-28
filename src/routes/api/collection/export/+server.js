import { db } from '$lib/db/index.js';
import { cards, collections } from '$lib/db/schema.js';
import { eq } from 'drizzle-orm';

// Quote a CSV field if it contains a comma, quote, or newline
function csvField(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url }) {
  const session = await locals.auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const setFilter = url.searchParams.get('set') || '';

  // Get the user's collection
  const userCollection = await db.select().from(collections)
    .where(eq(collections.user_id, session.user.id));

  // Enrich with card names
  const rows = [];
  for (const item of userCollection) {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, item.card_id) });
    if (!card) continue;

    // Optional set filter (match against the collection entry's set)
    if (setFilter) {
      const setIds = JSON.parse(card.set_ids || '[]');
      const matchesSet = item.set_id === setFilter || setIds.includes(setFilter);
      if (!matchesSet) continue;
    }

    rows.push({
      name: card.name,
      set: item.set_name || card.set_name || '',
      finish: 'Standard',
      product: 'Booster',
      quantity: item.quantity
    });
  }

  // Sort by name
  rows.sort((a, b) => a.name.localeCompare(b.name));

  // Build CSV in Curiosa format: card name,set,finish,product,quantity,notes
  const lines = ['card name,set,finish,product,quantity,notes'];
  for (const r of rows) {
    lines.push([
      csvField(r.name),
      csvField(r.set),
      csvField(r.finish),
      csvField(r.product),
      r.quantity,
      ''
    ].join(','));
  }

  const csv = lines.join('\n');
  const stamp = new Date().toISOString().replace(/[:.]/g, '_');
  const filename = setFilter ? `collection-${setFilter}-${stamp}.csv` : `collection-${stamp}.csv`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}
