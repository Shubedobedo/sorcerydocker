import { db } from '$lib/db/index.js';
import { trades, collections } from '$lib/db/schema.js';
import { eq, and, gt } from 'drizzle-orm';

/**
 * Takes `quantity` traded copies of a binder entry out of the owner's collection,
 * deleting the collection row when nothing is left. Matches on set too when the
 * entry has one, since copies from different sets are separate collection rows.
 *
 * Synchronous so it can run inside a better-sqlite3 transaction; pass the
 * transaction as `conn` there, or omit it to run standalone.
 */
export function removeFromCollection(trade, quantity, conn = db) {
  const conditions = [
    eq(collections.user_id, trade.user_id),
    eq(collections.card_id, trade.card_id)
  ];
  if (trade.set_id) conditions.push(eq(collections.set_id, trade.set_id));

  const entry = conn
    .select()
    .from(collections)
    .where(and(...conditions))
    .get();
  if (!entry) return;

  const remaining = entry.quantity - quantity;
  if (remaining <= 0) {
    conn.delete(collections).where(eq(collections.id, entry.id)).run();
  } else {
    conn.update(collections).set({ quantity: remaining }).where(eq(collections.id, entry.id)).run();
  }
}

/**
 * Marks every entry on the user's trade list as traded, in one transaction.
 *
 * An entry listed in full is archived in place, exactly like a single
 * "Mark Traded". A partly listed entry keeps its untraded copies in the binder,
 * and the traded copies become a new archived row so they appear in history.
 *
 * Returns the number of binder entries traded.
 */
export function completeTradeList(userId) {
  return db.transaction((tx) => {
    const listed = tx
      .select()
      .from(trades)
      .where(
        and(eq(trades.user_id, userId), eq(trades.status, 'available'), gt(trades.list_quantity, 0))
      )
      .all();

    const tradedAt = new Date().toISOString();
    for (const trade of listed) {
      const count = Math.min(trade.list_quantity, trade.quantity);

      if (count >= trade.quantity) {
        tx.update(trades)
          .set({ status: 'archived', traded_at: tradedAt, list_quantity: 0 })
          .where(eq(trades.id, trade.id))
          .run();
      } else {
        tx.update(trades)
          .set({ quantity: trade.quantity - count, list_quantity: 0 })
          .where(eq(trades.id, trade.id))
          .run();
        const { id, created_at, ...copy } = trade;
        tx.insert(trades)
          .values({
            ...copy,
            quantity: count,
            list_quantity: 0,
            status: 'archived',
            traded_at: tradedAt
          })
          .run();
      }

      removeFromCollection(trade, count, tx);
    }

    return listed.length;
  });
}
