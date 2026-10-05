import { json } from '@sveltejs/kit';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/db/index.js';
import { cubeCards, cubes, deckCards, decks } from '$lib/db/schema.js';

/**
 * Shared helpers for the read-only /api/v1 routes. Every route there is GET-only,
 * authenticated by requireApiKey(), and scoped to the key owner's own rows.
 */

/** A route `[id]` as an integer, or null when it isn't one (answered with a 404). */
export function parseId(param) {
  return /^\d+$/.test(param) ? Number(param) : null;
}

/** 404 for missing and unowned alike, so a key can't probe other users' ids. */
export function notFound(what) {
  return json({ error: `${what} not found` }, { status: 404 });
}

function parseTags(tags) {
  try {
    const parsed = JSON.parse(tags ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * The owner's decks, or just one when `deckId` is given. card_count leaves out
 * the avatar, matching the 30/60 counts on the deck page.
 */
export async function deckSummaries(userId, deckId) {
  const owned = eq(decks.user_id, userId);
  const rows = await db
    .select({
      id: decks.id,
      name: decks.name,
      format: decks.format,
      visibility: decks.visibility,
      tags: decks.tags,
      cube_id: decks.cube_id,
      card_count:
        sql`coalesce(sum(case when ${deckCards.zone} != 'avatar' then ${deckCards.quantity} end), 0)`.mapWith(
          Number
        ),
      updated_at: decks.updated_at
    })
    .from(decks)
    .leftJoin(deckCards, eq(deckCards.deck_id, decks.id))
    .where(deckId === undefined ? owned : and(owned, eq(decks.id, deckId)))
    .groupBy(decks.id)
    .orderBy(desc(decks.updated_at));

  return rows.map((d) => ({ ...d, tags: parseTags(d.tags) }));
}

/** The owner's cubes, or just one when `cubeId` is given. card_count sums copies. */
export async function cubeSummaries(userId, cubeId) {
  const owned = eq(cubes.user_id, userId);
  return db
    .select({
      id: cubes.id,
      name: cubes.name,
      visibility: cubes.visibility,
      card_count: sql`coalesce(sum(${cubeCards.quantity}), 0)`.mapWith(Number),
      updated_at: cubes.updated_at
    })
    .from(cubes)
    .leftJoin(cubeCards, eq(cubeCards.cube_id, cubes.id))
    .where(cubeId === undefined ? owned : and(owned, eq(cubes.id, cubeId)))
    .groupBy(cubes.id)
    .orderBy(desc(cubes.updated_at));
}

/**
 * Adds market_price to deck and cube card rows. These don't record a printing,
 * so resolve() falls back to the cheapest non-foil printing of the card.
 */
export function cardsWithPrices(rows, resolve) {
  return rows.map((c) => ({ ...c, market_price: resolve(c.card_id, null) }));
}
