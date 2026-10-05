/**
 * Builds a link Play Sorcery Online (playsorceryonline.com) can import a deck from.
 *
 * PSO only imports from Curiosa, Cursed Realm or Four Cores links. For a Cursed
 * Realm link it reads the `d` query param and accepts Cursed Realm's legacy
 * self-contained format — the whole deck as base64-encoded JSON — so nothing is
 * uploaded to or stored on Cursed Realm. Cards are matched by exact name.
 *
 * Everything that knows this format lives in this file: if PSO stops accepting
 * long legacy codes, or ever imports from this site directly, change it here.
 * No server or DB code, so it runs in the browser.
 */

const BASE_URL = 'https://cursedrealm.org/deckbuilder.html?d=';

const pairs = (cards) => cards.map((c) => [c.name, c.quantity]);

// btoa() only takes Latin-1, and names like "Courtesan Thaïs" are not, so encode
// to UTF-8 bytes first and base64 those.
function utf8ToBase64(text) {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * @param {{ name: string, avatar: { name: string } | null,
 *           atlas: { name: string, quantity: number }[],
 *           spellbook: { name: string, quantity: number }[] }} deck
 * @returns {string}
 */
export function buildPsoLink({ name, avatar, atlas, spellbook }) {
  const payload = {
    n: name,
    a: avatar ? [[avatar.name, 1]] : [],
    t: pairs(atlas),
    s: pairs(spellbook),
    c: []
  };
  // encodeURIComponent matters: a raw "+" in the query string reads as a space.
  return BASE_URL + encodeURIComponent(utf8ToBase64(JSON.stringify(payload)));
}
