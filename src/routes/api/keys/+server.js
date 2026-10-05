import { json } from '@sveltejs/kit';
import { ApiKeyError, createApiKey, listApiKeys } from '$lib/server/apiKeys.js';

// Session only, deliberately: an API key must never be able to mint or list keys,
// so this never reads the Authorization header.

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  return json({ keys: await listApiKeys(session.user.id) });
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, request }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  try {
    return json(await createApiKey(session.user.id, body?.name), { status: 201 });
  } catch (err) {
    if (err instanceof ApiKeyError) return json({ error: err.message }, { status: 400 });
    throw err;
  }
}
