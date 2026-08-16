import { db } from '$lib/db/index.js';
import { cubes, sets, friendships, users } from '$lib/db/schema.js';
import { eq, desc, and } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  const session = await locals.auth();

  const publicCubes = await db
    .select()
    .from(cubes)
    .where(eq(cubes.visibility, 'public'))
    .orderBy(desc(cubes.updated_at))
    .limit(20);

  let userCubes = [];
  let friendCubes = [];
  if (session?.user?.id) {
    userCubes = await db
      .select()
      .from(cubes)
      .where(eq(cubes.user_id, session.user.id))
      .orderBy(desc(cubes.updated_at));

    // Get friends' cubes set to "friends" visibility
    const sharingFriends = await db.select().from(friendships)
      .where(eq(friendships.friend_id, session.user.id));

    for (const f of sharingFriends) {
      const fCubes = await db.select().from(cubes)
        .where(and(eq(cubes.user_id, f.user_id), eq(cubes.visibility, 'friends')))
        .orderBy(desc(cubes.updated_at));
      const friend = await db.query.users.findFirst({ where: eq(users.id, f.user_id) });
      for (const c of fCubes) {
        friendCubes.push({ ...c, friendName: friend?.name || friend?.email || 'Friend' });
      }
    }
  }

  const allSets = await db.select().from(sets);

  return {
    publicCubes,
    userCubes,
    friendCubes,
    allSets,
    session
  };
}
