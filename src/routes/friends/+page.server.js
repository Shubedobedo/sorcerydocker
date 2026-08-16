import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { friendships, friendRequests, users } from '$lib/db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  const session = await locals.auth();
  if (!session?.user) throw redirect(303, '/login');

  const myFriendships = await db.select().from(friendships)
    .where(eq(friendships.user_id, session.user.id));

  const friends = [];
  for (const f of myFriendships) {
    const friend = await db.query.users.findFirst({ where: eq(users.id, f.friend_id) });
    if (friend) {
      friends.push({
        ...f,
        friend: { id: friend.id, name: friend.name, email: friend.email, image: friend.image }
      });
    }
  }

  const incoming = await db.select().from(friendRequests)
    .where(and(eq(friendRequests.to_user_id, session.user.id), eq(friendRequests.status, 'pending')));

  const incomingEnriched = [];
  for (const req of incoming) {
    const fromUser = await db.query.users.findFirst({ where: eq(users.id, req.from_user_id) });
    if (fromUser) {
      incomingEnriched.push({
        ...req,
        from: { id: fromUser.id, name: fromUser.name, email: fromUser.email, image: fromUser.image }
      });
    }
  }

  return { friends, incoming: incomingEnriched, session };
}
