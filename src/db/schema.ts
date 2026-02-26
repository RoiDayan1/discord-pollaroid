import type { Knex } from 'knex';

export async function initSchema(db: Knex) {
  // --- polls ---
  if (!(await db.schema.hasTable('polls'))) {
    await db.schema.createTable('polls', (table) => {
      table.text('id').primary();
      table.text('guild_id').notNullable();
      table.text('channel_id').notNullable();
      table.text('message_id');
      table.text('creator_id').notNullable();
      table.text('title').notNullable();
      table.text('mode').notNullable();
      table.integer('anonymous').notNullable().defaultTo(0);
      table.integer('show_live').notNullable().defaultTo(1);
      table.text('mentions').notNullable().defaultTo('[]');
      table.integer('closed').notNullable().defaultTo(0);
      table.timestamp('created_at').notNullable().defaultTo(db.fn.now());
    });
  }

  // --- poll_options ---
  if (!(await db.schema.hasTable('poll_options'))) {
    await db.schema.createTable('poll_options', (table) => {
      table.increments('id');
      table.text('poll_id').notNullable().references('id').inTable('polls');
      table.integer('idx').notNullable();
      table.text('label').notNullable();
      table.integer('target');
    });
  }

  // --- poll_votes ---
  if (!(await db.schema.hasTable('poll_votes'))) {
    await db.schema.createTable('poll_votes', (table) => {
      table.text('poll_id').notNullable().references('id').inTable('polls');
      table.text('option_label').notNullable();
      table.text('user_id').notNullable();
      table.timestamp('voted_at').notNullable().defaultTo(db.fn.now());
      table.primary(['poll_id', 'option_label', 'user_id']);
    });
  }

  // --- ranks ---
  if (!(await db.schema.hasTable('ranks'))) {
    await db.schema.createTable('ranks', (table) => {
      table.text('id').primary();
      table.text('guild_id').notNullable();
      table.text('channel_id').notNullable();
      table.text('message_id');
      table.text('creator_id').notNullable();
      table.text('title').notNullable();
      table.text('mode').notNullable();
      table.integer('anonymous').notNullable().defaultTo(0);
      table.integer('show_live').notNullable().defaultTo(0);
      table.text('mentions').notNullable().defaultTo('[]');
      table.integer('closed').notNullable().defaultTo(0);
      table.timestamp('created_at').notNullable().defaultTo(db.fn.now());
    });
  }

  // --- rank_options ---
  if (!(await db.schema.hasTable('rank_options'))) {
    await db.schema.createTable('rank_options', (table) => {
      table.increments('id');
      table.text('rank_id').notNullable().references('id').inTable('ranks');
      table.integer('idx').notNullable();
      table.text('label').notNullable();
    });
  }

  // --- rank_votes ---
  if (!(await db.schema.hasTable('rank_votes'))) {
    await db.schema.createTable('rank_votes', (table) => {
      table.text('rank_id').notNullable().references('id').inTable('ranks');
      table.integer('option_idx').notNullable();
      table.text('user_id').notNullable();
      table.integer('value').notNullable();
      table.timestamp('voted_at').notNullable().defaultTo(db.fn.now());
      table.primary(['rank_id', 'option_idx', 'user_id']);
    });
  }

  // --- Legacy migrations for existing SQLite databases ---

  // Migration: ranks — add show_live column
  if ((await db.schema.hasTable('ranks')) && !(await db.schema.hasColumn('ranks', 'show_live'))) {
    await db.schema.alterTable('ranks', (table) => {
      table.integer('show_live').notNullable().defaultTo(0);
    });
  }

  // Migration: polls — add mentions column
  if ((await db.schema.hasTable('polls')) && !(await db.schema.hasColumn('polls', 'mentions'))) {
    await db.schema.alterTable('polls', (table) => {
      table.text('mentions').notNullable().defaultTo('[]');
    });
  }

  // Migration: ranks — add mentions column
  if ((await db.schema.hasTable('ranks')) && !(await db.schema.hasColumn('ranks', 'mentions'))) {
    await db.schema.alterTable('ranks', (table) => {
      table.text('mentions').notNullable().defaultTo('[]');
    });
  }

  // Migration: poll_options — add target column
  if (
    (await db.schema.hasTable('poll_options')) &&
    !(await db.schema.hasColumn('poll_options', 'target'))
  ) {
    await db.schema.alterTable('poll_options', (table) => {
      table.integer('target');
    });
  }

  // Migration: poll_votes option_idx → option_label (SQLite legacy only)
  if (
    (await db.schema.hasTable('poll_votes')) &&
    (await db.schema.hasColumn('poll_votes', 'option_idx'))
  ) {
    await db.raw(`
      CREATE TABLE poll_votes_new (
        poll_id      TEXT NOT NULL REFERENCES polls(id),
        option_label TEXT NOT NULL,
        user_id      TEXT NOT NULL,
        voted_at     TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (poll_id, option_label, user_id)
      )
    `);
    await db.raw(`
      INSERT INTO poll_votes_new (poll_id, option_label, user_id, voted_at)
        SELECT pv.poll_id, po.label, pv.user_id, pv.voted_at
        FROM poll_votes pv
        JOIN poll_options po ON po.poll_id = pv.poll_id AND po.idx = pv.option_idx
    `);
    await db.raw('DROP TABLE poll_votes');
    await db.raw('ALTER TABLE poll_votes_new RENAME TO poll_votes');
  }
}
