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
      poll_id      TEXT NOT NULL REFERENCES polls(id),
      option_label TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      voted_at     TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (poll_id, option_label, user_id)
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
      show_live   INTEGER NOT NULL DEFAULT 0,
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

  // Migration: ranks — add show_live column
  const rankCols = db.pragma('table_info(ranks)') as { name: string }[];
  if (!rankCols.some((c) => c.name === 'show_live')) {
    db.exec(`ALTER TABLE ranks ADD COLUMN show_live INTEGER NOT NULL DEFAULT 0`);
  }

  // Migration: polls — add mentions column
  const pollCols = db.pragma('table_info(polls)') as { name: string }[];
  if (!pollCols.some((c) => c.name === 'mentions')) {
    db.exec(`ALTER TABLE polls ADD COLUMN mentions TEXT NOT NULL DEFAULT '[]'`);
  }

  // Migration: ranks — add mentions column
  const rankCols2 = db.pragma('table_info(ranks)') as { name: string }[];
  if (!rankCols2.some((c) => c.name === 'mentions')) {
    db.exec(`ALTER TABLE ranks ADD COLUMN mentions TEXT NOT NULL DEFAULT '[]'`);
  }

  // Migration: poll_options — add target column
  const pollOptionCols = db.pragma('table_info(poll_options)') as { name: string }[];
  if (!pollOptionCols.some((c) => c.name === 'target')) {
    db.exec(`ALTER TABLE poll_options ADD COLUMN target INTEGER DEFAULT NULL`);
  }

  // Migration: poll_votes option_idx → option_label
  const cols = db.pragma('table_info(poll_votes)') as { name: string }[];
  if (cols.some((c) => c.name === 'option_idx')) {
    db.exec(`
      CREATE TABLE poll_votes_new (
        poll_id      TEXT NOT NULL REFERENCES polls(id),
        option_label TEXT NOT NULL,
        user_id      TEXT NOT NULL,
        voted_at     TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (poll_id, option_label, user_id)
      );

      INSERT INTO poll_votes_new (poll_id, option_label, user_id, voted_at)
        SELECT pv.poll_id, po.label, pv.user_id, pv.voted_at
        FROM poll_votes pv
        JOIN poll_options po ON po.poll_id = pv.poll_id AND po.idx = pv.option_idx;

      DROP TABLE poll_votes;

      ALTER TABLE poll_votes_new RENAME TO poll_votes;
    `);
  }
}
