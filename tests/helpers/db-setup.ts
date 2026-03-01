import Knex, { type Knex as KnexType } from 'knex';
import { initSchema } from '../../src/db/schema.js';

/** Creates a fresh in-memory SQLite Knex instance with foreign keys enabled. */
export function createTestDb(): KnexType {
  return Knex({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    pool: {
      afterCreate(
        conn: { pragma: (s: string) => void },
        done: (err: Error | null, conn: unknown) => void,
      ) {
        conn.pragma('foreign_keys = ON');
        done(null, conn);
      },
    },
  });
}

/** Creates an in-memory DB and runs the full schema init. */
export async function setupTestDb(): Promise<KnexType> {
  const db = createTestDb();
  await initSchema(db);
  return db;
}

/** Deletes all rows from all tables in FK-safe order. */
export async function cleanAllTables(db: KnexType) {
  await db('poll_votes').del();
  await db('poll_options').del();
  await db('polls').del();
  await db('rank_votes').del();
  await db('rank_options').del();
  await db('ranks').del();
}
