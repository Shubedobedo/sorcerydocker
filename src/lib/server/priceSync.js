import { db } from '$lib/db/index.js';
import { cards, cardPrices, appMeta } from '$lib/db/schema.js';
import { eq, sql } from 'drizzle-orm';

const API_BASE = 'https://api.tcgapi.dev';
const GAME_SLUG = 'sorcery-contested-realm';
const PER_PAGE = 100;

/**
 * Normalize a card name into the same slug/id format used by the card sync.
 * Strips a trailing "(Foil)" marker since finish is tracked separately.
 */
function nameToCardId(name) {
  return name
    .replace(/\s*\(foil\)\s*$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function apiHeaders() {
  const key = process.env.TCGAPI_KEY;
  if (!key) throw new Error('TCGAPI_KEY is not set');
  return { 'X-API-Key': key };
}

/**
 * Run a full price sync: fetch all sets for Sorcery, page through each set's
 * cards, match to our cards by name, and upsert into card_prices.
 *
 * Respects the daily quota by stopping if daily_remaining runs low.
 * Returns a summary object.
 */
export async function runPriceSync() {
  const headers = apiHeaders();

  // Build a set of valid card IDs we know about (to only store matching prices)
  const knownCards = await db.select({ id: cards.id }).from(cards);
  const knownIds = new Set(knownCards.map((c) => c.id));

  // 1. Fetch all sets for the game
  const setsRes = await fetch(`${API_BASE}/v1/sets?game=${GAME_SLUG}`, { headers });
  if (!setsRes.ok) {
    const body = await setsRes.text();
    throw new Error(`Failed to fetch sets: ${setsRes.status} ${body}`);
  }
  const setsJson = await setsRes.json();
  const apiSets = setsJson.data || [];

  let matched = 0;
  let unmatched = 0;
  let priceRows = 0;
  let setsProcessed = 0;
  let stoppedEarly = false;
  let lastRateRemaining = setsJson.rate_limit?.daily_remaining ?? null;

  // Collect all price entries first, then replace the table in one pass
  const collected = [];

  for (const set of apiSets) {
    const totalPages = Math.max(1, Math.ceil((set.card_count || 0) / PER_PAGE));

    for (let page = 1; page <= totalPages; page++) {
      // Guard against exhausting the daily quota
      if (lastRateRemaining !== null && lastRateRemaining <= 2) {
        stoppedEarly = true;
        break;
      }

      const url = `${API_BASE}/v1/sets/${set.id}/cards?per_page=${PER_PAGE}&page=${page}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        if (res.status === 429) {
          stoppedEarly = true;
          break;
        }
        // Skip this page on other errors but keep going
        continue;
      }
      const json = await res.json();
      lastRateRemaining = json.rate_limit?.daily_remaining ?? lastRateRemaining;

      for (const item of json.data || []) {
        if (item.product_type && item.product_type !== 'Cards') continue;
        const cardId = nameToCardId(item.name);
        if (!knownIds.has(cardId)) {
          unmatched++;
          continue;
        }
        matched++;
        const finish = (item.printing || '').toLowerCase() === 'foil' || item.foil_only ? 'foil' : 'normal';
        collected.push({
          card_id: cardId,
          set_name: set.name,
          finish,
          tcgplayer_id: item.tcgplayer_id ?? null,
          market_price: item.market_price != null ? String(item.market_price) : null,
          low_price: item.low_price != null ? String(item.low_price) : null,
          median_price: item.median_price != null ? String(item.median_price) : null,
          total_listings: item.total_listings ?? null,
          image_url: item.image_url ?? null,
          price_updated_at: item.price_updated_at ?? null,
          synced_at: new Date().toISOString()
        });
      }

      if (!json.meta?.has_more && page >= totalPages) break;
    }

    setsProcessed++;
    if (stoppedEarly) break;
  }

  // Replace prices in a transaction: clear then insert everything collected.
  // Only do a full clear if we didn't stop early (to avoid wiping data on a partial run).
  if (!stoppedEarly) {
    await db.delete(cardPrices);
  }

  priceRows = collected.length;
  // Insert in chunks to avoid oversized statements
  const CHUNK = 200;
  for (let i = 0; i < collected.length; i += CHUNK) {
    const chunk = collected.slice(i, i + CHUNK);
    if (chunk.length > 0) {
      await db.insert(cardPrices).values(chunk);
    }
  }

  const now = new Date().toISOString();
  await setMeta('last_price_sync', now);

  return {
    success: true,
    setsProcessed,
    matched,
    unmatched,
    priceRows,
    stoppedEarly,
    rateRemaining: lastRateRemaining,
    syncedAt: now
  };
}

/**
 * Load all card prices and return helpers for resolving a price for a
 * given card_id + set_name. Prefers the set's normal price, then that set's
 * foil, then the cheapest normal across any set, then cheapest of any.
 */
export async function loadPriceResolver() {
  const rows = await db.select().from(cardPrices);
  const lookup = {};
  const byCard = {};
  for (const p of rows) {
    const market = p.market_price != null ? parseFloat(p.market_price) : null;
    lookup[`${p.card_id}::${p.set_name}::${p.finish}`] = market;
    (byCard[p.card_id] ||= []).push(p);
  }

  // finish: 'normal' (default) or 'foil' — determines which price to prefer.
  function resolve(cardId, setName, finish = 'normal') {
    const primary = finish === 'foil' ? 'foil' : 'normal';
    const secondary = finish === 'foil' ? 'normal' : 'foil';

    // Prefer the requested finish for the item's set
    if (lookup[`${cardId}::${setName}::${primary}`] != null) return lookup[`${cardId}::${setName}::${primary}`];
    // Then the other finish for that set
    if (lookup[`${cardId}::${setName}::${secondary}`] != null) return lookup[`${cardId}::${setName}::${secondary}`];

    const cardRows = byCard[cardId] || [];
    // Then cheapest of the requested finish across any set
    const primaryPrices = cardRows.filter((r) => r.finish === primary && r.market_price != null).map((r) => parseFloat(r.market_price));
    if (primaryPrices.length) return Math.min(...primaryPrices);
    // Fallback: cheapest of any finish
    const any = cardRows.filter((r) => r.market_price != null).map((r) => parseFloat(r.market_price));
    return any.length ? Math.min(...any) : null;
  }

  // Distinct set names that have price data for a given card (sorted by release order)
  const SET_ORDER = ['Alpha', 'Beta', 'Arthurian Legends', 'Arthurian Legends Promo', 'Dragonlord', 'Gothic', 'Dust Reward Promos'];
  function setsForCard(cardId) {
    const cardRows = byCard[cardId] || [];
    const names = [...new Set(cardRows.map((r) => r.set_name))];
    return names.sort((a, b) => {
      const ai = SET_ORDER.indexOf(a);
      const bi = SET_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }

  return { resolve, setsForCard };
}

export async function getMeta(key) {
  const row = await db.query.appMeta.findFirst({ where: eq(appMeta.key, key) });
  return row?.value ?? null;
}

export async function setMeta(key, value) {
  await db
    .insert(appMeta)
    .values({ key, value })
    .onConflictDoUpdate({ target: appMeta.key, set: { value } });
}
