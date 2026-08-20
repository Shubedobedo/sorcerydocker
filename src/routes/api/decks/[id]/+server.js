import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { decks, deckCards } from '$lib/db/schema.js';
import { eq, and } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function PATCH({ locals, request, params }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const deck = await db.query.decks.findFirst({
    where: and(eq(decks.id, parseInt(params.id)), eq(decks.user_id, session.user.id))
  });

  if (!deck) return json({ error: 'Deck not found' }, { status: 404 });

  const updates = await request.json();
  const allowed = ['name', 'description', 'format', 'visibility', 'tags', 'cube_id'];
  const set = {};

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      if (key === 'tags') {
        set[key] = JSON.stringify(updates[key]);
      } else if (key === 'cube_id') {
        set[key] = updates.format === 'cube' ? updates[key] : null;
      } else {
        set[key] = updates[key];
      }
    }
  }

  set.updated_at = new Date().toISOString();

  await db.update(decks).set(set).where(eq(decks.id, deck.id));

  return json({ success: true });
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ locals, params }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const deck = await db.query.decks.findFirst({
    where: and(eq(decks.id, parseInt(params.id)), eq(decks.user_id, session.user.id))
  });

  if (!deck) return json({ error: 'Deck not found' }, { status: 404 });

  await db.delete(decks).where(eq(decks.id, deck.id));

  return json({ success: true });
}
