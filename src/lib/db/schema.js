import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ============================================================
// CARDS
// ============================================================

export const cards = sqliteTable('cards', {
  id: text('id').primaryKey(), // unique card identifier from API
  name: text('name').notNull(),
  type: text('type'), // e.g., Minion, Magic, Site, Aura, Artifact
  subtype: text('subtype'),
  cost: integer('cost'),
  elements: text('elements'), // JSON array, e.g. '["Fire","Water"]'
  rarity: text('rarity'), // Ordinary, Exceptional, Elite, Unique
  description: text('description'),
  set_id: text('set_id'),
  set_name: text('set_name'),
  set_ids: text('set_ids'), // JSON array of all set IDs, e.g. '["alpha","beta"]'
  power: integer('power'),
  toughness: integer('toughness'),
  slug: text('slug').unique(), // URL-friendly identifier
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
});

export const cardImages = sqliteTable('card_images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  card_id: text('card_id').notNull().references(() => cards.id),
  image_url: text('image_url').notNull(),
  art_type: text('art_type').notNull().default('standard'), // standard, alt_art, promo, etc.
  set_id: text('set_id'),
  set_name: text('set_name')
});

// ============================================================
// USERS
// ============================================================

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').unique(),
  image: text('image'),
  role: text('role').notNull().default('member'), // admin, member
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString())
});

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  provider_account_id: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token')
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  session_token: text('session_token').unique().notNull(),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: text('expires').notNull()
});

// ============================================================
// DECKS
// ============================================================

export const decks = sqliteTable('decks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  format: text('format').notNull().default('standard'), // standard, freeform
  visibility: text('visibility').notNull().default('private'), // private, public, shared
  tags: text('tags'), // JSON array of element/archetype tags
  slug: text('slug').unique(),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
});

export const deckCards = sqliteTable('deck_cards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deck_id: integer('deck_id').notNull().references(() => decks.id, { onDelete: 'cascade' }),
  card_id: text('card_id').notNull().references(() => cards.id),
  zone: text('zone').notNull(), // atlas, spellbook
  quantity: integer('quantity').notNull().default(1)
});

export const deckShares = sqliteTable('deck_shares', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deck_id: integer('deck_id').notNull().references(() => decks.id, { onDelete: 'cascade' }),
  shared_with_user_id: text('shared_with_user_id').notNull().references(() => users.id),
  share_token: text('share_token').unique(), // for link-based sharing
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString())
});

// ============================================================
// COLLECTIONS
// ============================================================

export const collections = sqliteTable('collections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  card_id: text('card_id').notNull().references(() => cards.id),
  set_id: text('set_id'), // which set this copy is from
  set_name: text('set_name'),
  quantity: integer('quantity').notNull().default(1)
});

export const collectionSettings = sqliteTable('collection_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').unique().notNull().references(() => users.id, { onDelete: 'cascade' }),
  visibility: text('visibility').notNull().default('private') // private, public
});

// ============================================================
// CUBES
// ============================================================

export const cubes = sqliteTable('cubes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  visibility: text('visibility').notNull().default('private'), // private, public, shared
  // Randomizer settings (stored as JSON)
  settings: text('settings'), // JSON: { sets, rarities, elements, cubeSize, rarityLimits }
  slug: text('slug').unique(),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString())
});

export const cubeCards = sqliteTable('cube_cards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cube_id: integer('cube_id').notNull().references(() => cubes.id, { onDelete: 'cascade' }),
  card_id: text('card_id').notNull().references(() => cards.id),
  quantity: integer('quantity').notNull().default(1)
});

export const cubeShares = sqliteTable('cube_shares', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cube_id: integer('cube_id').notNull().references(() => cubes.id, { onDelete: 'cascade' }),
  shared_with_user_id: text('shared_with_user_id').notNull().references(() => users.id),
  share_token: text('share_token').unique(),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString())
});

// ============================================================
// SETS (reference table)
// ============================================================

export const sets = sqliteTable('sets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code'),
  released_at: text('released_at'),
  card_count: integer('card_count')
});

// ============================================================
// TRADES
// ============================================================

export const trades = sqliteTable('trades', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  card_id: text('card_id').notNull().references(() => cards.id),
  set_id: text('set_id'),
  set_name: text('set_name'),
  quantity: integer('quantity').notNull().default(1),
  location: text('location'), // e.g. "Binder 2, Page 6"
  expected_value: text('expected_value'), // e.g. "$25" or "15 USD"
  status: text('status').notNull().default('available'), // available, traded, archived
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  traded_at: text('traded_at')
});

// ============================================================
// FRIENDS
// ============================================================

export const friendRequests = sqliteTable('friend_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  from_user_id: text('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  to_user_id: text('to_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'), // pending, accepted, rejected
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString())
});

export const friendships = sqliteTable('friendships', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  friend_id: text('friend_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  share_decks: integer('share_decks').notNull().default(0), // 0 = no, 1 = yes
  share_cubes: integer('share_cubes').notNull().default(0),
  share_collection: integer('share_collection').notNull().default(0),
  share_trades: integer('share_trades').notNull().default(0),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString())
});
