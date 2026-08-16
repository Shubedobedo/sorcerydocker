import { error } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { decks, deckCards, cards, cardImages, friendships } from '$lib/db/schema.js';
import { eq, and, like, or } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, params }) {
  const session = await locals.auth();

  const deck = await db.query.decks.findFirst({
    where: eq(decks.slug, params.slug)
  });

  if (!deck) {
    throw error(404, 'Deck not found');
  }

  // Check visibility
  const isOwner = session?.user?.id === deck.user_id;
  if ((deck.visibility === 'private' || deck.visibility === 'friends') && !isOwner) {
    let canView = false;
    if (session?.user?.id && deck.visibility === 'friends') {
      // Just check if they're friends (either direction)
      const friendship = await db.query.friendships.findFirst({
        where: and(
          eq(friendships.user_id, deck.user_id),
          eq(friendships.friend_id, session.user.id)
        )
      });
      canView = !!friendship;
    }
    if (!canView) throw error(404, 'Deck not found');
  }

  // Get deck cards
  const deckCardRows = await db
    .select()
    .from(deckCards)
    .where(eq(deckCards.deck_id, deck.id));

  const allDeckCards = [];
  for (const dc of deckCardRows) {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, dc.card_id) });
    if (card) {
      const img = await db.query.cardImages.findFirst({
        where: and(eq(cardImages.card_id, card.id), like(cardImages.art_type, 'standard%'))
      });
      allDeckCards.push({
        ...dc,
        card: { ...card, image_url: img?.image_url || null }
      });
    }
  }

  const atlas = allDeckCards.filter((dc) => dc.zone === 'atlas');
  const spellbook = allDeckCards.filter((dc) => dc.zone === 'spellbook');

  // Validation for standard format
  const warnings = [];
  if (deck.format === 'standard') {
    const atlasCount = atlas.reduce((sum, dc) => sum + dc.quantity, 0);
    const spellbookCount = spellbook.reduce((sum, dc) => sum + dc.quantity, 0);

    if (atlasCount !== 30) {
      warnings.push(`Atlas: ${atlasCount}/30 cards (need exactly 30)`);
    }
    if (spellbookCount !== 60) {
      warnings.push(`Spellbook: ${spellbookCount}/60 cards (need exactly 60)`);
    }

    // Check copy limits by rarity
    const rarityLimits = { Ordinary: 4, Exceptional: 3, Elite: 2, Unique: 1 };
    const allCards = [...atlas, ...spellbook];
    const countByCard = {};

    for (const dc of allCards) {
      const key = dc.card.name;
      countByCard[key] = (countByCard[key] || 0) + dc.quantity;
    }

    for (const dc of allCards) {
      const rarity = dc.card.rarity;
      const limit = rarityLimits[rarity];
      if (limit && countByCard[dc.card.name] > limit) {
        const msg = `${dc.card.name}: ${countByCard[dc.card.name]}x exceeds ${rarity} limit of ${limit}`;
        if (!warnings.includes(msg)) warnings.push(msg);
      }
    }
  }

  return {
    deck,
    atlas,
    spellbook,
    warnings,
    isOwner,
    session
  };
}
