import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Minimal .env reader. Playwright doesn't go through Vite, so `$env/dynamic/private`
 * isn't available here and the file has to be parsed directly. Deliberately not a
 * full dotenv implementation — it only needs KEY=value lines.
 */
export function readEnv(key) {
  if (process.env[key]) return process.env[key];
  let text;
  try {
    text = readFileSync(resolve(root, '.env'), 'utf8');
  } catch {
    throw new Error(
      `Cannot read .env — copy .env.example to .env before running tests (needed: ${key})`
    );
  }
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && match[1] === key) {
      return match[2].replace(/^["']|["']$/g, '').trim();
    }
  }
  throw new Error(`${key} is not set in .env`);
}

export const ROOT = root;
