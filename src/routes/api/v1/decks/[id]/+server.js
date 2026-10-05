import { json } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/db/index.js';
import { cards, deckCards } from '$lib/db/schema.js';
import { invalidApiKey, requireApiKey } from '$lib/server/apiKeys.js';
import { cardsWithPrices, deckSummaries, notFound, parseId } from '$lib/server/apiV1.js';
import { loadPriceResolver } from '$lib/server/priceSync.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ request, params }) {
  const userId = await requireApiKey(request);
  if (!userId) return invalidApiKey();

  const id = parseId(params.id);
  if (id === null) return notFound('Deck');

  // Matches on id AND owner, so another user's deck is a 404 whatever its visibility.
  const [deck] = await deckSummaries(userId, id);
  if (!deck) return notFound('Deck');

  const rows = await db
    .select({
      card_id: deckCards.card_id,
      name: cards.name,
      zone: deckCards.zone,
      quantity: deckCards.quantity
    })
    .from(deckCards)
    .innerJoin(cards, eq(cards.id, deckCards.card_id))
    .where(eq(deckCards.deck_id, id))
    .orderBy(asc(cards.name));

  const { resolve } = await loadPriceResolver();
  const priced = cardsWithPrices(rows, resolve);
  const zone = (name) => priced.filter((c) => c.zone === name).map(({ zone, ...c }) => c);
  const avatar = zone('avatar')[0];

  return json({
    ...deck,
    avatar: avatar
      ? { card_id: avatar.card_id, name: avatar.name, market_price: avatar.market_price }
      : null,
    atlas: zone('atlas'),
    spellbook: zone('spellbook')
  });
}
