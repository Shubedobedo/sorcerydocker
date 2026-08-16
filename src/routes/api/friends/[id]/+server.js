import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { friendRequests, friendships } from '$lib/db/schema.js';
import { eq, and } from 'drizzle-orm';

// PATCH — accept/reject a request, or update sharing toggles
export async function PATCH({ locals, request, params }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const { action, share_decks, share_cubes, share_collection, share_trades } = await request.json();

  // Handle friend request accept/reject
  if (action === 'accept' || action === 'reject') {
    const req = await db.query.friendRequests.findFirst({
      where: and(eq(friendRequests.id, parseInt(params.id)), eq(friendRequests.to_user_id, userId))
    });

    if (!req) return json({ error: 'Request not found' }, { status: 404 });

    if (action === 'accept') {
      await db.update(friendRequests).set({ status: 'accepted' }).where(eq(friendRequests.id, req.id));
      // Create friendships both ways
      await db.insert(friendships).values({ user_id: userId, friend_id: req.from_user_id });
      await db.insert(friendships).values({ user_id: req.from_user_id, friend_id: userId });
      return json({ success: true });
    } else {
      await db.update(friendRequests).set({ status: 'rejected' }).where(eq(friendRequests.id, req.id));
      return json({ success: true });
    }
  }

  // Handle sharing toggle updates (params.id is the friendship ID)
  const updates = {};
  if (share_decks !== undefined) updates.share_decks = share_decks ? 1 : 0;
  if (share_cubes !== undefined) updates.share_cubes = share_cubes ? 1 : 0;
  if (share_collection !== undefined) updates.share_collection = share_collection ? 1 : 0;
  if (share_trades !== undefined) updates.share_trades = share_trades ? 1 : 0;

  if (Object.keys(updates).length > 0) {
    await db.update(friendships).set(updates).where(
      and(eq(friendships.id, parseInt(params.id)), eq(friendships.user_id, userId))
    );
  }

  return json({ success: true });
}

// DELETE — remove a friend
export async function DELETE({ locals, params }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const friendshipId = parseInt(params.id);

  // Get the friendship to find the friend
  const friendship = await db.query.friendships.findFirst({
    where: and(eq(friendships.id, friendshipId), eq(friendships.user_id, userId))
  });

  if (!friendship) return json({ error: 'Not found' }, { status: 404 });

  // Delete both directions
  await db.delete(friendships).where(
    and(eq(friendships.user_id, userId), eq(friendships.friend_id, friendship.friend_id))
  );
  await db.delete(friendships).where(
    and(eq(friendships.user_id, friendship.friend_id), eq(friendships.friend_id, userId))
  );

  return json({ success: true });
}
