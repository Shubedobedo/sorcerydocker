import { db } from '$lib/db/index.js';
import { decks, users, friendships } from '$lib/db/schema.js';
import { eq, desc, and, inArray } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  const session = await locals.auth();

  // Get public decks
  const publicDecks = await db
    .select({
      id: decks.id,
      name: decks.name,
      format: decks.format,
      slug: decks.slug,
      user_id: decks.user_id,
      created_at: decks.created_at,
      updated_at: decks.updated_at
    })
    .from(decks)
    .where(eq(decks.visibility, 'public'))
    .orderBy(desc(decks.updated_at))
    .limit(20);

  // Get user's decks if logged in
  let userDecks = [];
  let friendDecks = [];
  if (session?.user?.id) {
    userDecks = await db
      .select()
      .from(decks)
      .where(eq(decks.user_id, session.user.id))
      .orderBy(desc(decks.updated_at));

    // Get friends' decks set to "friends" visibility
    const myFriendships = await db.select().from(friendships)
      .where(eq(friendships.friend_id, session.user.id));

    if (myFriendships.length > 0) {
      const friendIds = myFriendships.map((f) => f.user_id);
      for (const fId of friendIds) {
        const fDecks = await db.select().from(decks)
          .where(and(eq(decks.user_id, fId), eq(decks.visibility, 'friends')))
          .orderBy(desc(decks.updated_at));
        const friend = await db.query.users.findFirst({ where: eq(users.id, fId) });
        for (const d of fDecks) {
          friendDecks.push({ ...d, friendName: friend?.name || friend?.email || 'Friend' });
        }
      }
    }
  }

  return {
    publicDecks,
    userDecks,
    friendDecks,
    session
  };
}
