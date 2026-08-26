import { error } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { collections, collectionSettings, cards, cardImages, sets, users, friendships } from '$lib/db/schema.js';
import { eq, and, like, asc } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, params }) {
  const session = await locals.auth();
  const targetUserId = params.userId;

  // Get the target user
  const targetUser = await db.query.users.findFirst({ where: eq(users.id, targetUserId) });
  if (!targetUser) throw error(404, 'User not found');

  // Check if the viewer is the owner
  const isOwner = session?.user?.id === targetUserId;

  if (!isOwner) {
    // Check visibility: collection settings (public) or friendship sharing
    let canView = false;

    // Check if collection is public
    const settings = await db.query.collectionSettings.findFirst({
      where: eq(collectionSettings.user_id, targetUserId)
    });
    if (settings?.visibility === 'public') {
      canView = true;
    }

    // Check friendship sharing
    if (!canView && session?.user?.id) {
      const theirSharing = await db.query.friendships.findFirst({
        where: and(
          eq(friendships.user_id, targetUserId),
          eq(friendships.friend_id, session.user.id)
        )
      });
      if (theirSharing?.share_collection) {
        canView = true;
      }
    }

    if (!canView) {
      throw error(403, 'This collection is not shared with you');
    }
  }

  // Load the collection
  const userCollection = await db
    .select()
    .from(collections)
    .where(eq(collections.user_id, targetUserId));

  // Enrich with card data
  const enriched = [];
  for (const item of userCollection) {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, item.card_id) });
    if (card) {
      const img = await db.query.cardImages.findFirst({
        where: and(eq(cardImages.card_id, card.id), like(cardImages.art_type, 'standard%'))
      });
      enriched.push({
        ...item,
        card: { ...card, image_url: img?.image_url || null }
      });
    }
  }

  enriched.sort((a, b) => a.card.name.localeCompare(b.card.name));

  const allSets = await db.select().from(sets).orderBy(asc(sets.name));

  return {
    collection: enriched,
    allSets,
    owner: { id: targetUser.id, name: targetUser.name, image: targetUser.image },
    isOwner,
    session
  };
}
