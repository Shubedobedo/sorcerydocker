import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { users } from '$lib/db/schema.js';
import { eq } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function PATCH({ locals, request }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const { name, image } = await request.json();
  const updates = {};

  if (name !== undefined) {
    const trimmedName = name.trim();
    if (trimmedName) {
      // Check username uniqueness
      const existing = await db.query.users.findFirst({
        where: eq(users.name, trimmedName)
      });
      if (existing && existing.id !== session.user.id) {
        return json({ error: 'Username is already taken' }, { status: 400 });
      }
      updates.name = trimmedName;
    }
  }
  if (image !== undefined) updates.image = image.trim() || null;

  if (Object.keys(updates).length === 0) {
    return json({ error: 'Nothing to update' }, { status: 400 });
  }

  await db.update(users).set(updates).where(eq(users.id, session.user.id));

  return json({ success: true });
}
