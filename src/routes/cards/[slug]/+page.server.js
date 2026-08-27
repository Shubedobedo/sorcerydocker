import { db } from '$lib/db/index.js';
import { cards, cardImages, decks, collections, cardPrices } from '$lib/db/schema.js';
import { eq, and } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, locals }) {
  const session = await locals.auth();

  const card = await db.query.cards.findFirst({
    where: eq(cards.slug, params.slug)
  });

  if (!card) {
    throw error(404, 'Card not found');
  }

  const images = await db
    .select()
    .from(cardImages)
    .where(eq(cardImages.card_id, card.id));

  // Get user's decks for "Add to Deck" feature
  let userDecks = [];
  if (session?.user?.id) {
    userDecks = await db
      .select({ id: decks.id, name: decks.name, format: decks.format, slug: decks.slug })
      .from(decks)
      .where(eq(decks.user_id, session.user.id));
  }

  // Get user's collection count for this card
  let ownedCount = 0;
  if (session?.user?.id) {
    const owned = await db
      .select()
      .from(collections)
      .where(and(eq(collections.user_id, session.user.id), eq(collections.card_id, card.id)));
    ownedCount = owned.reduce((sum, item) => sum + item.quantity, 0);
  }

  // Get prices for this card, grouped by set + finish
  const priceRows = await db
    .select()
    .from(cardPrices)
    .where(eq(cardPrices.card_id, card.id));

  // Group into { setName: { normal: {...}, foil: {...} } }
  const priceMap = {};
  let lastPriceUpdate = null;
  for (const p of priceRows) {
    if (!priceMap[p.set_name]) priceMap[p.set_name] = {};
    priceMap[p.set_name][p.finish] = {
      market: p.market_price ? parseFloat(p.market_price) : null,
      low: p.low_price ? parseFloat(p.low_price) : null,
      median: p.median_price ? parseFloat(p.median_price) : null,
      listings: p.total_listings,
      tcgplayer_id: p.tcgplayer_id
    };
    if (p.price_updated_at && (!lastPriceUpdate || p.price_updated_at > lastPriceUpdate)) {
      lastPriceUpdate = p.price_updated_at;
    }
  }

  // Order sets by release order (newest sets first is fine, but keep a sensible order)
  const setOrder = ['Alpha', 'Beta', 'Arthurian Legends', 'Arthurian Legends Promo', 'Dragonlord', 'Gothic', 'Dust Reward Promos'];
  const prices = Object.entries(priceMap)
    .map(([setName, finishes]) => ({ setName, finishes }))
    .sort((a, b) => {
      const ai = setOrder.indexOf(a.setName);
      const bi = setOrder.indexOf(b.setName);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

  return {
    card,
    images,
    userDecks,
    ownedCount,
    prices,
    lastPriceUpdate,
    session
  };
}
