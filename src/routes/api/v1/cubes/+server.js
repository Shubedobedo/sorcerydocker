import { json } from '@sveltejs/kit';
import { invalidApiKey, requireApiKey } from '$lib/server/apiKeys.js';
import { cubeSummaries } from '$lib/server/apiV1.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ request }) {
  const userId = await requireApiKey(request);
  if (!userId) return invalidApiKey();

  return json({ cubes: await cubeSummaries(userId) });
}
