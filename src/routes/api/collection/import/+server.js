import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { collections, cards } from '$lib/db/schema.js';
import { eq, and } from 'drizzle-orm';

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, request }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const text = await request.text();
  const lines = text.trim().split('\n');

  // Skip header row
  if (lines.length < 2) {
    return json({ error: 'CSV is empty or missing data rows' }, { status: 400 });
  }

  const header = lines[0].toLowerCase();
  if (!header.includes('card_id') || !header.includes('quantity')) {
    return json({ error: 'CSV must have card_id and quantity columns' }, { status: 400 });
  }

  // Parse header to find column indices
  const cols = header.split(',').map((c) => c.trim());
  const cardIdIdx = cols.indexOf('card_id');
  const qtyIdx = cols.indexOf('quantity');

  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    if (row.length <= Math.max(cardIdIdx, qtyIdx)) continue;

    const cardId = row[cardIdIdx]?.trim();
    const quantity = parseInt(row[qtyIdx]?.trim());

    if (!cardId || isNaN(quantity)) {
      skipped++;
      continue;
    }

    // Verify card exists
    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
    if (!card) {
      skipped++;
      continue;
    }

    // Find existing collection entry
    const existing = await db.query.collections.findFirst({
      where: and(eq(collections.user_id, session.user.id), eq(collections.card_id, cardId))
    });

    if (quantity <= 0) {
      // Remove from collection
      if (existing) {
        await db.delete(collections).where(eq(collections.id, existing.id));
        imported++;
      }
    } else if (existing) {
      // Update quantity (overwrite)
      await db.update(collections).set({ quantity }).where(eq(collections.id, existing.id));
      imported++;
    } else {
      // Insert new
      await db.insert(collections).values({
        user_id: session.user.id,
        card_id: cardId,
        set_id: card.set_id,
        set_name: card.set_name,
        quantity
      });
      imported++;
    }
  }

  return json({ success: true, imported, skipped });
}
