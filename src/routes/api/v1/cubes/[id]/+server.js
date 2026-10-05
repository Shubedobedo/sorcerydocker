import { json } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/db/index.js';
import { cards, cubeCards } from '$lib/db/schema.js';
import { invalidApiKey, requireApiKey } from '$lib/server/apiKeys.js';
import { cardsWithPrices, cubeSummaries, notFound, parseId } from '$lib/server/apiV1.js';
import { loadPriceResolver } from '$lib/server/priceSync.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ request, params }) {
  const userId = await requireApiKey(request);
  if (!userId) return invalidApiKey();

  const id = parseId(params.id);
  if (id === null) return notFound('Cube');

  // Matches on id AND owner, so another user's cube is a 404 whatever its visibility.
  const [cube] = await cubeSummaries(userId, id);
  if (!cube) return notFound('Cube');

  const rows = await db
    .select({ card_id: cubeCards.card_id, name: cards.name, quantity: cubeCards.quantity })
    .from(cubeCards)
    .innerJoin(cards, eq(cards.id, cubeCards.card_id))
    .where(eq(cubeCards.cube_id, id))
    .orderBy(asc(cards.name));

  const { resolve } = await loadPriceResolver();
  return json({ ...cube, cards: cardsWithPrices(rows, resolve) });
}
