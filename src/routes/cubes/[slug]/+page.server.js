import { error } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { cubes, cubeCards, cards, cardImages, friendships } from '$lib/db/schema.js';
import { eq, and, like, asc } from 'drizzle-orm';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, params }) {
  const session = await locals.auth();

  const cube = await db.query.cubes.findFirst({
    where: eq(cubes.slug, params.slug)
  });

  if (!cube) throw error(404, 'Cube not found');

  const isOwner = session?.user?.id === cube.user_id;
  if ((cube.visibility === 'private' || cube.visibility === 'friends') && !isOwner) {
    let canView = false;
    if (session?.user?.id && cube.visibility === 'friends') {
      const friendship = await db.query.friendships.findFirst({
        where: and(
          eq(friendships.user_id, cube.user_id),
          eq(friendships.friend_id, session.user.id)
        )
      });
      canView = !!friendship;
    }
    if (!canView) throw error(404, 'Cube not found');
  }

  // Get cube cards
  const cubeCardRows = await db
    .select()
    .from(cubeCards)
    .where(eq(cubeCards.cube_id, cube.id));

  const enriched = [];
  for (const cc of cubeCardRows) {
    const card = await db.query.cards.findFirst({ where: eq(cards.id, cc.card_id) });
    if (card) {
      const img = await db.query.cardImages.findFirst({
        where: and(eq(cardImages.card_id, card.id), like(cardImages.art_type, 'standard%'))
      });
      enriched.push({ ...cc, card: { ...card, image_url: img?.image_url || null } });
    }
  }

  enriched.sort((a, b) => a.card.name.localeCompare(b.card.name));

  const totalCards = enriched.reduce((sum, cc) => sum + cc.quantity, 0);

  return {
    cube: { ...cube, settings: cube.settings ? JSON.parse(cube.settings) : {} },
    pool: enriched,
    totalCards,
    isOwner,
    session
  };
}
