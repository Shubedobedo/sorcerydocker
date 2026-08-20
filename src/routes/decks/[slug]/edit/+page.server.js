import { redirect } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { decks, deckCards, cards, cardImages, cubeCards, cubes } from '$lib/db/schema.js';
import { eq, and, like } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, params }) {
  const session = await locals.auth();

  if (!session?.user) {
    throw redirect(303, '/login');
  }

  const deck = await db.query.decks.findFirst({
    where: and(eq(decks.slug, params.slug), eq(decks.user_id, session.user.id))
  });

  if (!deck) {
    throw redirect(303, '/decks');
  }

  // Get deck cards with full card data
  const deckCardRows = await db
    .select()
    .from(deckCards)
    .where(eq(deckCards.deck_id, deck.id));

  // Actually get all cards in the deck
  const allDeckCards = [];
  for (const dc of deckCardRows) {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, dc.card_id) });
    if (card) {
      // Get first standard image
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

  // If cube format, load the cube pool for validation
  let cubePool = null;
  let cubeName = null;
  let cubeSlug = null;
  if (deck.format === 'cube' && deck.cube_id) {
    const cube = await db.query.cubes.findFirst({ where: eq(cubes.id, deck.cube_id) });
    if (cube) {
      cubeName = cube.name;
      cubeSlug = cube.slug;

      const poolRows = await db.select().from(cubeCards).where(eq(cubeCards.cube_id, cube.id));
      // Build a map of card_id -> { quantity, card data }
      const poolEntries = [];
      for (const pc of poolRows) {
        const card = await db.query.cards.findFirst({ where: eq(cards.id, pc.card_id) });
        if (card) {
          const img = await db.query.cardImages.findFirst({
            where: and(eq(cardImages.card_id, card.id), like(cardImages.art_type, 'standard%'))
          });
          poolEntries.push({
            card_id: pc.card_id,
            quantity: pc.quantity,
            card: { ...card, image_url: img?.image_url || null }
          });
        }
      }
      cubePool = poolEntries;
    }
  }

  return {
    deck,
    atlas,
    spellbook,
    cubePool,
    cubeName,
    cubeSlug,
    session
  };
}
