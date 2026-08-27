import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { collections, cards, cardImages, sets, trades, cardPrices } from '$lib/db/schema.js';
import { eq, and, like, asc } from 'drizzle-orm';

// Build a lookup: `${card_id}::${set_name}::${finish}` -> market price (number)
function buildPriceLookup(priceRows) {
  const map = {};
  for (const p of priceRows) {
    const market = p.market_price != null ? parseFloat(p.market_price) : null;
    map[`${p.card_id}::${p.set_name}::${p.finish}`] = market;
  }
  return map;
}

// Resolve the best price for a collection item (prefer its set's normal price,
// then that set's foil, then any normal price for the card as a fallback).
function resolvePrice(priceLookup, priceRowsByCard, cardId, setName) {
  const normalKey = `${cardId}::${setName}::normal`;
  if (priceLookup[normalKey] != null) return priceLookup[normalKey];
  const foilKey = `${cardId}::${setName}::foil`;
  if (priceLookup[foilKey] != null) return priceLookup[foilKey];
  // Fallback: cheapest normal price across any set for this card
  const rows = priceRowsByCard[cardId] || [];
  const normals = rows.filter((r) => r.finish === 'normal' && r.market_price != null).map((r) => parseFloat(r.market_price));
  if (normals.length) return Math.min(...normals);
  const anyPrices = rows.filter((r) => r.market_price != null).map((r) => parseFloat(r.market_price));
  return anyPrices.length ? Math.min(...anyPrices) : null;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
  const session = await locals.auth();

  if (!session?.user) {
    throw redirect(303, '/login');
  }

  const userCollection = await db
    .select()
    .from(collections)
    .where(eq(collections.user_id, session.user.id));

  // Load all prices once and index them
  const allPriceRows = await db.select().from(cardPrices);
  const priceLookup = buildPriceLookup(allPriceRows);
  const priceRowsByCard = {};
  for (const p of allPriceRows) {
    (priceRowsByCard[p.card_id] ||= []).push(p);
  }

  // Enrich with card data
  const enriched = [];
  let totalValue = 0;
  for (const item of userCollection) {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, item.card_id) });
    if (card) {
      const img = await db.query.cardImages.findFirst({
        where: and(eq(cardImages.card_id, card.id), like(cardImages.art_type, 'standard%'))
      });
      const price = resolvePrice(priceLookup, priceRowsByCard, item.card_id, item.set_name);
      if (price != null) totalValue += price * item.quantity;
      enriched.push({
        ...item,
        price,
        card: { ...card, image_url: img?.image_url || null }
      });
    }
  }

  // Sort by card name
  enriched.sort((a, b) => a.card.name.localeCompare(b.card.name));

  const allSets = await db.select().from(sets).orderBy(asc(sets.name));

  // Load ALL cards for the "missing" filter (cards not in collection)
  const allCards = await db.select().from(cards).orderBy(asc(cards.name));
  const collectedCardIds = new Set(enriched.map((item) => item.card_id));

  const missingCards = [];
  for (const card of allCards) {
    if (!collectedCardIds.has(card.id)) {
      const img = await db.query.cardImages.findFirst({
        where: and(eq(cardImages.card_id, card.id), like(cardImages.art_type, 'standard%'))
      });
      missingCards.push({
        id: `missing-${card.id}`,
        card_id: card.id,
        set_id: card.set_id,
        set_name: card.set_name,
        quantity: 0,
        card: { ...card, image_url: img?.image_url || null }
      });
    }
  }

  // Load trade binder quantities (available trades) for the extra filter
  const userTrades = await db.select().from(trades)
    .where(and(eq(trades.user_id, session.user.id), eq(trades.status, 'available')));

  // Build a map of card_id -> total trade quantity
  const tradeMap = {};
  for (const t of userTrades) {
    tradeMap[t.card_id] = (tradeMap[t.card_id] || 0) + t.quantity;
  }

  return {
    collection: enriched,
    missingCards,
    allSets,
    tradeMap,
    totalValue,
    session
  };
}
