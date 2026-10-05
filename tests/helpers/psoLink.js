import { expect } from '@playwright/test';

export const PSO_PREFIX = 'https://cursedrealm.org/deckbuilder.html?d=';

/**
 * Reverses buildPsoLink(): decodeURIComponent → base64 → UTF-8 → JSON. Uses
 * Node's Buffer rather than anything from src/lib/psoLink.js, so a bug in the
 * encoder can't be cancelled out by the same bug in the decoder.
 */
export function decodePsoLink(url) {
  expect(url.startsWith(PSO_PREFIX), url).toBe(true);
  const d = url.slice(PSO_PREFIX.length);
  return JSON.parse(Buffer.from(decodeURIComponent(d), 'base64').toString('utf8'));
}
