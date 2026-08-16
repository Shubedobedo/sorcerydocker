import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { cards, cardImages, sets } from '$lib/db/schema.js';
import { eq, sql } from 'drizzle-orm';

const IMAGE_BASE_URL = 'https://d27a44hjr9gen3.cloudfront.net/cards';

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals }) {
  const session = await locals.auth();

  if (!session?.user || session.user.role !== 'admin') {
    return json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const response = await fetch('https://api.sorcerytcg.com/api/cards');

    if (!response.ok) {
      return json({ error: 'Failed to fetch from Sorcery API', status: response.status }, { status: 502 });
    }

    const data = await response.json();
    let syncedCards = 0;
    let syncedImages = 0;

    // Clear all existing images so we get a fresh set with correct URLs
    await db.delete(cardImages);
    const seenSets = new Map();

    for (const item of data) {
      // Parse elements into an array
      const elements = item.elements
        ? item.elements.split(',').map((e) => e.trim()).filter(Boolean)
        : [];

      // Use the card name as the basis for a unique ID and slug
      const slug = item.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const cardId = slug;
      const guardian = item.guardian || {};

      // Determine which set to associate as "primary" (first set)
      const primarySet = item.sets?.[0];
      const setName = primarySet?.name || 'Unknown';

      // Collect all set IDs this card appears in
      const allSetIds = (item.sets || []).map((s) => s.name.toLowerCase().replace(/\s+/g, '-'));

      // Insert/update the card
      await db
        .insert(cards)
        .values({
          id: cardId,
          name: item.name,
          type: guardian.type || null,
          subtype: item.subTypes || null,
          cost: guardian.cost,
          elements: JSON.stringify(elements),
          rarity: guardian.rarity || null,
          description: guardian.rulesText || null,
          set_id: setName.toLowerCase().replace(/\s+/g, '-'),
          set_name: setName,
          set_ids: JSON.stringify(allSetIds),
          power: guardian.attack,
          toughness: guardian.defence,
          slug
        })
        .onConflictDoUpdate({
          target: cards.id,
          set: {
            name: item.name,
            type: guardian.type || null,
            subtype: item.subTypes || null,
            cost: guardian.cost,
            elements: JSON.stringify(elements),
            rarity: guardian.rarity || null,
            description: guardian.rulesText || null,
            set_id: setName.toLowerCase().replace(/\s+/g, '-'),
            set_name: setName,
            set_ids: JSON.stringify(allSetIds),
            power: guardian.attack,
            toughness: guardian.defence,
            updated_at: new Date().toISOString()
          }
        });

      syncedCards++;

      // Process each set printing and its variants for images
      if (item.sets) {
        for (const setData of item.sets) {
          const setId = setData.name.toLowerCase().replace(/\s+/g, '-');

          // Track sets
          if (!seenSets.has(setId)) {
            seenSets.set(setId, {
              id: setId,
              name: setData.name,
              released_at: setData.releasedAt || null
            });
          }

          // Process variants (each variant is a unique art/printing)
          if (setData.variants) {
            for (const variant of setData.variants) {
              const imageUrl = `${IMAGE_BASE_URL}/${variant.slug}.png`;
              const artType = variant.finish === 'Foil'
                ? 'foil'
                : variant.finish === 'Rainbow'
                  ? 'rainbow'
                  : 'standard';

              // Insert image
              await db.insert(cardImages).values({
                card_id: cardId,
                image_url: imageUrl,
                art_type: `${artType} - ${variant.product}`,
                set_id: setId,
                set_name: setData.name
              });
              syncedImages++;
            }
          }
        }
      }
    }

    // Upsert sets
    for (const [setId, setInfo] of seenSets) {
      await db
        .insert(sets)
        .values({
          id: setInfo.id,
          name: setInfo.name,
          released_at: setInfo.released_at
        })
        .onConflictDoUpdate({
          target: sets.id,
          set: {
            name: setInfo.name,
            released_at: setInfo.released_at
          }
        });
    }

    return json({
      success: true,
      synced: syncedCards,
      images: syncedImages,
      sets: seenSets.size
    });
  } catch (err) {
    console.error('Sync error:', err);
    return json({ error: 'Sync failed', details: err.message }, { status: 500 });
  }
}
