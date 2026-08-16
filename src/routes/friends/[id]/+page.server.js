import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { users, friendships, decks, cubes, collections, trades, cards, cardImages } from '$lib/db/schema.js';
import { eq, and, like, desc } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, params }) {
  const session = await locals.auth();
  if (!session?.user) throw redirect(303, '/login');

  const friendId = params.id;

  // Verify friendship exists
  const friendship = await db.query.friendships.findFirst({
    where: and(eq(friendships.user_id, session.user.id), eq(friendships.friend_id, friendId))
  });
  if (!friendship) throw error(404, 'Not friends');

  // Get the friend's sharing settings toward me
  const theirSharing = await db.query.friendships.findFirst({
    where: and(eq(friendships.user_id, friendId), eq(friendships.friend_id, session.user.id))
  });

  const friend = await db.query.users.findFirst({ where: eq(users.id, friendId) });
  if (!friend) throw error(404, 'User not found');

  // Get shared data based on their settings and visibility
  let sharedDecks = [];
  let sharedCubes = [];
  let sharedCollection = [];
  let sharedTrades = [];

  // Decks — show if visibility is "friends" or "public"
  sharedDecks = await db.select().from(decks)
    .where(and(eq(decks.user_id, friendId), eq(decks.visibility, 'friends')))
    .orderBy(desc(decks.updated_at));
  const publicDecks = await db.select().from(decks)
    .where(and(eq(decks.user_id, friendId), eq(decks.visibility, 'public')))
    .orderBy(desc(decks.updated_at));
  sharedDecks = [...sharedDecks, ...publicDecks];

  // Cubes — show if visibility is "friends" or "public"
  sharedCubes = await db.select().from(cubes)
    .where(and(eq(cubes.user_id, friendId), eq(cubes.visibility, 'friends')))
    .orderBy(desc(cubes.updated_at));
  const publicCubes = await db.select().from(cubes)
    .where(and(eq(cubes.user_id, friendId), eq(cubes.visibility, 'public')))
    .orderBy(desc(cubes.updated_at));
  sharedCubes = [...sharedCubes, ...publicCubes];

  // Collection — only if they share with me
  if (theirSharing?.share_collection) {
    const rawCollection = await db.select().from(collections)
      .where(eq(collections.user_id, friendId));
    for (const item of rawCollection) {
      const card = await db.query.cards.findFirst({ where: eq(cards.id, item.card_id) });
      if (card) {
        const img = await db.query.cardImages.findFirst({
          where: and(eq(cardImages.card_id, card.id), like(cardImages.art_type, 'standard%'))
        });
        sharedCollection.push({ ...item, card: { name: card.name, slug: card.slug, image_url: img?.image_url || null, type: card.type } });
      }
    }
    sharedCollection.sort((a, b) => a.card.name.localeCompare(b.card.name));
  }

  // Trades — only if they share with me
  if (theirSharing?.share_trades) {
    const rawTrades = await db.select().from(trades)
      .where(and(eq(trades.user_id, friendId), eq(trades.status, 'available')));
    for (const trade of rawTrades) {
      const card = await db.query.cards.findFirst({ where: eq(cards.id, trade.card_id) });
      if (card) {
        const img = await db.query.cardImages.findFirst({
          where: and(eq(cardImages.card_id, card.id), like(cardImages.art_type, 'standard%'))
        });
        sharedTrades.push({ ...trade, card: { name: card.name, slug: card.slug, image_url: img?.image_url || null, type: card.type } });
      }
    }
  }

  return {
    friend: { id: friend.id, name: friend.name, image: friend.image },
    sharedDecks,
    sharedCubes,
    sharedCollection,
    sharedTrades,
    canSeeCollection: !!theirSharing?.share_collection,
    canSeeTrades: !!theirSharing?.share_trades,
    session
  };
}
