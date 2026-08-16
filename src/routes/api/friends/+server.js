import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { friendRequests, friendships, users } from '$lib/db/schema.js';
import { eq, and, or } from 'drizzle-orm';

// GET — list friends and pending requests
export async function GET({ locals }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;

  // Get friendships where I'm either user_id or friend_id
  const myFriendships = await db.select().from(friendships).where(eq(friendships.user_id, userId));

  // Enrich with friend user data
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

  // Get pending requests TO me
  const incoming = await db.select().from(friendRequests)
    .where(and(eq(friendRequests.to_user_id, userId), eq(friendRequests.status, 'pending')));

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

  // Get pending requests FROM me
  const outgoing = await db.select().from(friendRequests)
    .where(and(eq(friendRequests.from_user_id, userId), eq(friendRequests.status, 'pending')));

  return json({ friends, incoming: incomingEnriched, outgoing });
}

// POST — send a friend request
export async function POST({ locals, request }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const { email, username } = await request.json();
  if (!email && !username) return json({ error: 'Email or username is required' }, { status: 400 });

  const userId = session.user.id;

  // Find target user by email or username
  let targetUser;
  if (email) {
    targetUser = await db.query.users.findFirst({ where: eq(users.email, email) });
  }
  if (!targetUser && username) {
    targetUser = await db.query.users.findFirst({ where: eq(users.name, username) });
  }
  if (!targetUser) return json({ error: 'User not found' }, { status: 404 });
  if (targetUser.id === userId) return json({ error: "Can't friend yourself" }, { status: 400 });

  // Check if already friends
  const existing = await db.query.friendships.findFirst({
    where: and(eq(friendships.user_id, userId), eq(friendships.friend_id, targetUser.id))
  });
  if (existing) return json({ error: 'Already friends' }, { status: 400 });

  // Check if request already pending
  const pendingReq = await db.query.friendRequests.findFirst({
    where: and(
      eq(friendRequests.from_user_id, userId),
      eq(friendRequests.to_user_id, targetUser.id),
      eq(friendRequests.status, 'pending')
    )
  });
  if (pendingReq) return json({ error: 'Request already sent' }, { status: 400 });

  // Check if they already sent us a request — auto-accept
  const theirReq = await db.query.friendRequests.findFirst({
    where: and(
      eq(friendRequests.from_user_id, targetUser.id),
      eq(friendRequests.to_user_id, userId),
      eq(friendRequests.status, 'pending')
    )
  });

  if (theirReq) {
    // Auto-accept: create friendships both ways
    await db.update(friendRequests).set({ status: 'accepted' }).where(eq(friendRequests.id, theirReq.id));
    await db.insert(friendships).values({ user_id: userId, friend_id: targetUser.id });
    await db.insert(friendships).values({ user_id: targetUser.id, friend_id: userId });
    return json({ success: true, message: 'Friend added!' });
  }

  // Create request
  await db.insert(friendRequests).values({
    from_user_id: userId,
    to_user_id: targetUser.id
  });

  return json({ success: true, message: 'Request sent!' });
}
