import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { cubes, sets } from '$lib/db/schema.js';
import { eq, and, asc } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, params }) {
  const session = await locals.auth();
  if (!session?.user) throw redirect(303, '/login');

  const cube = await db.query.cubes.findFirst({
    where: and(eq(cubes.slug, params.slug), eq(cubes.user_id, session.user.id))
  });

  if (!cube) throw redirect(303, '/cubes');

  const allSets = await db.select().from(sets).orderBy(asc(sets.name));

  return {
    cube: { ...cube, settings: cube.settings ? JSON.parse(cube.settings) : {} },
    allSets,
    session
  };
}
