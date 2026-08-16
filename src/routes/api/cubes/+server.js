import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { cubes, cubeCards, cards } from '$lib/db/schema.js';
import { eq, and, like, inArray } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, request }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const { name, description, settings } = await request.json();

  if (!name?.trim()) {
    return json({ error: 'Name is required' }, { status: 400 });
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);

  const [cube] = await db.insert(cubes).values({
    user_id: session.user.id,
    name: name.trim(),
    description: description || null,
    settings: settings ? JSON.stringify(settings) : null,
    slug
  }).returning();

  return json(cube, { status: 201 });
}
