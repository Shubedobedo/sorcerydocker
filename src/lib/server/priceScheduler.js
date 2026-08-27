import { runPriceSync, getMeta } from './priceSync.js';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // re-check every 6 hours

let started = false;

async function maybeSync() {
  try {
    if (!process.env.TCGAPI_KEY) return; // no key configured, skip silently

    const last = await getMeta('last_price_sync');
    const lastTime = last ? new Date(last).getTime() : 0;
    const age = Date.now() - lastTime;

    if (age >= THREE_DAYS_MS) {
      console.log('[priceScheduler] Prices are stale, running sync...');
      const result = await runPriceSync();
      console.log('[priceScheduler] Sync complete:', {
        matched: result.matched,
        priceRows: result.priceRows,
        setsProcessed: result.setsProcessed,
        stoppedEarly: result.stoppedEarly
      });
    }
  } catch (err) {
    console.error('[priceScheduler] Auto-sync failed:', err.message);
  }
}

/**
 * Start the background price sync scheduler. Safe to call multiple times —
 * it only initializes once per process.
 */
export function startPriceScheduler() {
  if (started) return;
  started = true;

  // Run an initial check shortly after boot (delay so startup isn't blocked)
  setTimeout(() => { maybeSync(); }, 30 * 1000);

  // Then re-check periodically
  setInterval(() => { maybeSync(); }, CHECK_INTERVAL_MS);
}
