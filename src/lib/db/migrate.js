import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './index.js';

// Run migrations from the drizzle folder
migrate(db, { migrationsFolder: './drizzle' });

console.log('Migrations complete.');
