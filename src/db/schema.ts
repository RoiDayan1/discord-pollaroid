import type Database from 'better-sqlite3';

export function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS polls (
      id          TEXT PRIMARY KEY,
      guild_id    TEXT NOT NULL,
      channel_id  TEXT NOT NULL,
      message_id  TEXT,
      creator_id  TEXT NOT NULL,
      title       TEXT NOT NULL,
      mode        TEXT NOT NULL CHECK(mode IN ('single', 'multi')),
      anonymous   INTEGER NOT NULL DEFAULT 0,
      show_live   INTEGER NOT NULL DEFAULT 1,
      closed      INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS poll_options (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id  TEXT NOT NULL REFERENCES polls(id),
      idx      INTEGER NOT NULL,
      label    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      poll_id    TEXT NOT NULL REFERENCES polls(id),
      option_idx INTEGER NOT NULL,
      user_id    TEXT NOT NULL,
      voted_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (poll_id, option_idx, user_id)
    );

    CREATE TABLE IF NOT EXISTS ranks (
      id          TEXT PRIMARY KEY,
      guild_id    TEXT NOT NULL,
      channel_id  TEXT NOT NULL,
      message_id  TEXT,
      creator_id  TEXT NOT NULL,
      title       TEXT NOT NULL,
      mode        TEXT NOT NULL CHECK(mode IN ('star', 'order')),
      anonymous   INTEGER NOT NULL DEFAULT 0,
      closed      INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rank_options (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      rank_id  TEXT NOT NULL REFERENCES ranks(id),
      idx      INTEGER NOT NULL,
      label    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rank_votes (
      rank_id    TEXT NOT NULL REFERENCES ranks(id),
      option_idx INTEGER NOT NULL,
      user_id    TEXT NOT NULL,
      value      INTEGER NOT NULL,
      voted_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (rank_id, option_idx, user_id)
    );
  `);
}
