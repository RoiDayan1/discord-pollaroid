import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { initSchema } from './schema.js';

const db: DatabaseType = new Database('pollaroid.db');

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

initSchema(db);

export default db;
