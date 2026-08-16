/** @type {import('drizzle-kit').Config} */
export default {
  schema: './src/lib/db/schema.js',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/sorcery.db'
  }
};
