import { json } from '@sveltejs/kit';
import { db } from '$lib/db/index.js';
import { collections, cards } from '$lib/db/schema.js';
import { eq, and } from 'drizzle-orm';

// Parse a single CSV line, honoring double-quoted fields with escaped quotes.
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

// Slugify a card name into our card id format (same as the sync/pricing logic).
function nameToCardId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** @type {import('./$types').RequestHandler} */
export async function POST({ locals, request }) {
  const session = await locals.auth();
  if (!session?.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const text = await request.text();
  const lines = text.replace(/\r/g, '').trim().split('\n');

  if (lines.length < 2) {
    return json({ error: 'CSV is empty or missing data rows' }, { status: 400 });
  }

  const header = parseCsvLine(lines[0]).map((c) => c.toLowerCase());

  // Support both the Curiosa format ("card name") and our legacy format ("card_id")
  const nameIdx = header.indexOf('card name');
  const cardIdIdx = header.indexOf('card_id');
  const qtyIdx = header.indexOf('quantity');
  const setIdx = header.indexOf('set');

  if (qtyIdx === -1 || (nameIdx === -1 && cardIdIdx === -1)) {
    return json({ error: 'CSV must have a "card name" (or card_id) column and a "quantity" column' }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = parseCsvLine(lines[i]);

    const quantity = parseInt(row[qtyIdx]);
    if (isNaN(quantity)) { skipped++; continue; }

    // Resolve the card id (by name or explicit id)
    let cardId;
    if (nameIdx !== -1 && row[nameIdx]) {
      cardId = nameToCardId(row[nameIdx]);
    } else if (cardIdIdx !== -1) {
      cardId = row[cardIdIdx];
    }
    if (!cardId) { skipped++; continue; }

    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
    if (!card) { skipped++; continue; }

    // Use the set from the CSV if present, otherwise the card's primary set
    const setName = (setIdx !== -1 && row[setIdx]) ? row[setIdx] : card.set_name;
    const setId = setName ? setName.toLowerCase().replace(/\s+/g, '-') : card.set_id;

    // Match existing entry by card + set so different-set copies stay separate
    const conditions = [
      eq(collections.user_id, session.user.id),
      eq(collections.card_id, cardId)
    ];
    if (setId) conditions.push(eq(collections.set_id, setId));

    const existing = await db.query.collections.findFirst({ where: and(...conditions) });

    if (quantity <= 0) {
      if (existing) {
        await db.delete(collections).where(eq(collections.id, existing.id));
        imported++;
      }
    } else if (existing) {
      await db.update(collections).set({ quantity }).where(eq(collections.id, existing.id));
      imported++;
    } else {
      await db.insert(collections).values({
        user_id: session.user.id,
        card_id: cardId,
        set_id: setId,
        set_name: setName,
        quantity
      });
      imported++;
    }
  }

  return json({ success: true, imported, skipped });
}
