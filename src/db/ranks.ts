import { RankMode } from '../util/constants.js';
import db from './connection.js';

export interface Rank {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  creator_id: string;
  title: string;
  mode: RankMode;
  anonymous: number;
  show_live: number;
  mentions: string;
  closed: number;
  created_at: string;
}

export interface RankOption {
  id: number;
  rank_id: string;
  idx: number;
  label: string;
}

export interface RankVote {
  rank_id: string;
  option_idx: number;
  user_id: string;
  value: number;
  voted_at: string;
}

export function createRank(rank: Omit<Rank, 'message_id' | 'created_at'>, options: string[]) {
  const insertRank = db.prepare(`
    INSERT INTO ranks (id, guild_id, channel_id, creator_id, title, mode, anonymous, show_live, mentions, closed)
    VALUES (@id, @guild_id, @channel_id, @creator_id, @title, @mode, @anonymous, @show_live, @mentions, @closed)
  `);
  const insertOption = db.prepare(`
    INSERT INTO rank_options (rank_id, idx, label) VALUES (?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertRank.run(rank);
    for (let i = 0; i < options.length; i++) {
      insertOption.run(rank.id, i, options[i]);
    }
  });
  tx();
}

export function setRankMessageId(rankId: string, messageId: string) {
  db.prepare('UPDATE ranks SET message_id = ? WHERE id = ?').run(messageId, rankId);
}

export function getRank(rankId: string): Rank | undefined {
  return db.prepare('SELECT * FROM ranks WHERE id = ?').get(rankId) as Rank | undefined;
}

export function getRankOptions(rankId: string): RankOption[] {
  return db
    .prepare('SELECT * FROM rank_options WHERE rank_id = ? ORDER BY idx')
    .all(rankId) as RankOption[];
}

export function getRankVotes(rankId: string): RankVote[] {
  return db.prepare('SELECT * FROM rank_votes WHERE rank_id = ?').all(rankId) as RankVote[];
}

export function getUserRankVotes(rankId: string, userId: string): RankVote[] {
  return db
    .prepare('SELECT * FROM rank_votes WHERE rank_id = ? AND user_id = ?')
    .all(rankId, userId) as RankVote[];
}

export function voteRankStar(rankId: string, optionIdx: number, userId: string, stars: number) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM rank_votes WHERE rank_id = ? AND option_idx = ? AND user_id = ?').run(
      rankId,
      optionIdx,
      userId,
    );
    db.prepare(
      'INSERT INTO rank_votes (rank_id, option_idx, user_id, value) VALUES (?, ?, ?, ?)',
    ).run(rankId, optionIdx, userId, stars);
  });
  tx();
}

export function voteRankOrder(
  rankId: string,
  userId: string,
  ordering: { optionIdx: number; position: number }[],
) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM rank_votes WHERE rank_id = ? AND user_id = ?').run(rankId, userId);
    const insert = db.prepare(
      'INSERT INTO rank_votes (rank_id, option_idx, user_id, value) VALUES (?, ?, ?, ?)',
    );
    for (const { optionIdx, position } of ordering) {
      insert.run(rankId, optionIdx, userId, position);
    }
  });
  tx();
}

export function getOpenRanksByCreator(creatorId: string, channelId: string): Rank[] {
  return db
    .prepare('SELECT * FROM ranks WHERE creator_id = ? AND channel_id = ? AND closed = 0')
    .all(creatorId, channelId) as Rank[];
}

export function updateRank(
  rankId: string,
  updates: {
    title: string;
    mode: RankMode;
    anonymous: number;
    show_live: number;
    mentions: string;
    options: string[];
  },
): boolean {
  let votesCleared = false;
  const tx = db.transaction(() => {
    const currentRank = getRank(rankId);
    if (!currentRank) return;

    db.prepare(
      'UPDATE ranks SET title = ?, mode = ?, anonymous = ?, show_live = ?, mentions = ? WHERE id = ?',
    ).run(
      updates.title,
      updates.mode,
      updates.anonymous,
      updates.show_live,
      updates.mentions,
      rankId,
    );

    const currentOptions = getRankOptions(rankId);
    const oldLabels = currentOptions.map((o) => o.label);
    const newLabels = updates.options;
    const optionsChanged =
      oldLabels.length !== newLabels.length || oldLabels.some((l, i) => l !== newLabels[i]);
    const modeChanged = currentRank.mode !== updates.mode;

    // Rank votes are keyed by option_idx, so any option change invalidates indices.
    // Order mode rankings depend on the full set. Mode changes make votes semantically invalid.
    if (modeChanged || optionsChanged) {
      const result = db.prepare('DELETE FROM rank_votes WHERE rank_id = ?').run(rankId);
      if (result.changes > 0) votesCleared = true;
    }

    if (optionsChanged) {
      db.prepare('DELETE FROM rank_options WHERE rank_id = ?').run(rankId);
      const insertOption = db.prepare(
        'INSERT INTO rank_options (rank_id, idx, label) VALUES (?, ?, ?)',
      );
      for (let i = 0; i < updates.options.length; i++) {
        insertOption.run(rankId, i, updates.options[i]);
      }
    }
  });
  tx();
  return votesCleared;
}

export function closeRank(rankId: string) {
  db.prepare('UPDATE ranks SET closed = 1 WHERE id = ?').run(rankId);
}
