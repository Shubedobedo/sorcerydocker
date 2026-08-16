import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { cubes, cubeCards } from '$lib/db/schema.js';
import { eq, and } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function PATCH({ locals, request, params }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const cube = await db.query.cubes.findFirst({
    where: and(eq(cubes.id, parseInt(params.id)), eq(cubes.user_id, session.user.id))
  });

  if (!cube) return json({ error: 'Cube not found' }, { status: 404 });

  const updates = await request.json();
  const allowed = ['name', 'description', 'visibility', 'settings'];
  const set = {};

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      set[key] = key === 'settings' ? JSON.stringify(updates[key]) : updates[key];
    }
  }
  set.updated_at = new Date().toISOString();

  await db.update(cubes).set(set).where(eq(cubes.id, cube.id));
  return json({ success: true });
}

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ locals, params }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const cube = await db.query.cubes.findFirst({
    where: and(eq(cubes.id, parseInt(params.id)), eq(cubes.user_id, session.user.id))
  });

  if (!cube) return json({ error: 'Cube not found' }, { status: 404 });
  await db.delete(cubes).where(eq(cubes.id, cube.id));
  return json({ success: true });
}
