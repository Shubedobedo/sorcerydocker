import { json } from '@sveltejs/kit';
import { completeTradeList } from '$lib/server/trades.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const traded = completeTradeList(session.user.id);
  return json({ traded });
}
