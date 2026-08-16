import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { cards } from '$lib/db/schema.js';
import { like } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function GET({ url }) {
  const q = url.searchParams.get('q') || '';
  const limit = parseInt(url.searchParams.get('limit') || '10');

  if (q.length < 2) {
    return json([]);
  }

  const results = await db
    .select({
      id: cards.id,
      name: cards.name,
      type: cards.type,
      set_name: cards.set_name,
      slug: cards.slug
    })
    .from(cards)
    .where(like(cards.name, `%${q}%`))
    .limit(limit);

  return json(results);
}
