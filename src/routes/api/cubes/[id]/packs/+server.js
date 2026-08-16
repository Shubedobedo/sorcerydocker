import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { cubes, cubeCards, cards, cardImages } from '$lib/db/schema.js';
import { eq, and, like } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, request, params }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const { packsPerPlayer = 3, cardsPerPack = 15, players = 8 } = await request.json();

  const cube = await db.query.cubes.findFirst({
    where: eq(cubes.id, parseInt(params.id))
  });

  if (!cube) return json({ error: 'Cube not found' }, { status: 404 });

  // Get cube card pool
  const cubeCardRows = await db
    .select()
    .from(cubeCards)
    .where(eq(cubeCards.cube_id, cube.id));

  // Expand into individual cards
  const pool = [];
  for (const cc of cubeCardRows) {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, cc.card_id) });
    if (card) {
      const img = await db.query.cardImages.findFirst({
        where: and(eq(cardImages.card_id, card.id), like(cardImages.art_type, 'standard%'))
      });
      for (let i = 0; i < cc.quantity; i++) {
        pool.push({ ...card, image_url: img?.image_url || null });
      }
    }
  }

  // Shuffle the pool
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Generate packs
  const totalPacks = packsPerPlayer * players;
  const totalCardsNeeded = totalPacks * cardsPerPack;

  if (pool.length < totalCardsNeeded) {
    return json({
      error: `Not enough cards in cube. Need ${totalCardsNeeded} but only have ${pool.length}.`,
    }, { status: 400 });
  }

  const packs = [];
  for (let i = 0; i < totalPacks; i++) {
    const pack = pool.slice(i * cardsPerPack, (i + 1) * cardsPerPack);
    packs.push(pack);
  }

  return json({ packs, totalPacks, cardsPerPack });
}
