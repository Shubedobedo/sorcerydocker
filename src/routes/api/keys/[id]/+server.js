import { json } from '@sveltejs/kit';
import { revokeApiKey } from '$lib/server/apiKeys.js';

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ locals, params }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  // 404 whether the key is missing or someone else's, so ids can't be probed.
  const revoked = await revokeApiKey(session.user.id, Number(params.id));
  if (!revoked) return json({ error: 'API key not found' }, { status: 404 });

  return json({ success: true });
}
