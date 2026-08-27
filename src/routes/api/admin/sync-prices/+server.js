import { json } from '@sveltejs/kit';
import { runPriceSync } from '$lib/server/priceSync.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals }) {
  const session = await locals.auth();

  if (!session?.user || session.user.role !== 'admin') {
    return json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (!process.env.TCGAPI_KEY) {
    return json({ error: 'TCGAPI_KEY is not configured' }, { status: 500 });
  }

  try {
    const result = await runPriceSync();
    return json(result);
  } catch (err) {
    console.error('Price sync error:', err);
    return json({ error: 'Price sync failed', details: err.message }, { status: 500 });
  }
}
