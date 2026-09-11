import { db } from '$lib/db/index.js';
import { cards, cubeCards } from '$lib/db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * A deck holds exactly one avatar, stored as a third `deck_cards.zone` value
 * alongside `atlas` and `spellbook`. The column is plain TEXT with no CHECK
 * constraint, so this needed no migration.
 *
 * These helpers are the single source of truth for which avatars a deck may
 * use — the cards endpoint, the deck edit page and decklist import all call
 * them, so the rule cannot drift between the API and the UI that feeds it.
 */

/** Card id of Spellslinger, which is legal in every deck. Ids are slugified names. */
export const SPELLSLINGER_ID = 'spellslinger';

export const AVATAR_ZONE = 'avatar';

/** @param {{ type?: string | null } | undefined | null} card */
export function isAvatarCard(card) {
  return card?.type === 'Avatar';
}

/**
 * Every avatar a deck is allowed to use, in name order.
 *
 * A normal deck may use any avatar in the catalog. A cube deck is limited to
 * the avatars in its cube's pool — plus Spellslinger, which is always available
 * even when the pool does not contain it. Pool presence is all that matters:
 * an avatar does not consume a copy, so two decks built from one cube can pick
 * the same one.
 *
 * @param {{ format?: string | null, cube_id?: number | null }} deck
 */
export async function legalAvatarsFor(deck) {
  const all = await db.select().from(cards).where(eq(cards.type, 'Avatar'));
  all.sort((a, b) => a.name.localeCompare(b.name));

  if (deck?.format !== 'cube' || !deck?.cube_id) return all;

  const pool = await db.select().from(cubeCards).where(eq(cubeCards.cube_id, deck.cube_id));
  const inPool = new Set(pool.map((c) => c.card_id));

  return all.filter((card) => card.id === SPELLSLINGER_ID || inPool.has(card.id));
}

/**
 * Why a deck may not use this avatar, or null when it may.
 *
 * Returns a message rather than a boolean so the endpoint and the UI can say
 * the same thing for the same reason.
 *
 * @param {{ format?: string | null, cube_id?: number | null }} deck
 * @param {string} cardId
 */
export async function avatarRejectionReason(deck, cardId) {
  const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
  if (!card) return 'Card not found';
  if (!isAvatarCard(card)) return `${card.name} is not an Avatar`;

  if (deck?.format !== 'cube' || !deck?.cube_id) return null;
  if (cardId === SPELLSLINGER_ID) return null;

  const inPool = await db.query.cubeCards.findFirst({
    where: and(eq(cubeCards.cube_id, deck.cube_id), eq(cubeCards.card_id, cardId))
  });
  if (inPool) return null;

  return `${card.name} is not in this cube pool. Only avatars from the pool, or Spellslinger, may be used.`;
}
