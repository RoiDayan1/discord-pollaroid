import Knex from 'knex';
import { config } from '../config.js';
import { initSchema } from './schema.js';

const isPostgres = !!config.databaseUrl;

const db = Knex(
  isPostgres
    ? {
        client: 'pg',
        connection: config.databaseUrl,
      }
    : {
        client: 'better-sqlite3',
        connection: { filename: 'pollaroid.db' },
        useNullAsDefault: true,
        pool: {
          afterCreate: (
            conn: { pragma: (s: string) => void },
            done: (err: Error | null, conn: unknown) => void,
          ) => {
            conn.pragma('journal_mode = WAL');
            conn.pragma('foreign_keys = ON');
            done(null, conn);
          },
        },
      },
);

export async function initDb() {
  await initSchema(db);
}

export { isPostgres };
export default db;
