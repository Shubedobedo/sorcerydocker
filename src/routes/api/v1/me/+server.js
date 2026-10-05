import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/db/index.js';
import { users } from '$lib/db/schema.js';
import { invalidApiKey, requireApiKey } from '$lib/server/apiKeys.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ request }) {
  const userId = await requireApiKey(request);
  if (!userId) return invalidApiKey();

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return json({ id: user.id, name: user.name });
}
