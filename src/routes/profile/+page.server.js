import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { decks, cubes, users } from '$lib/db/schema.js';
import { eq } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  const session = await locals.auth();

  if (!session?.user) {
    throw redirect(303, '/login');
  }

  // Get the full user record from DB
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id)
  });

  const userDecks = await db
    .select()
    .from(decks)
    .where(eq(decks.user_id, session.user.id));

  const userCubes = await db
    .select()
    .from(cubes)
    .where(eq(cubes.user_id, session.user.id));

  return {
    user: dbUser,
    decks: userDecks,
    cubes: userCubes
  };
}
