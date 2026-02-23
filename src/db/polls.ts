import db from './connection.js';

export interface Poll {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  creator_id: string;
  title: string;
  mode: 'single' | 'multi';
  anonymous: number;
  show_live: number;
  closed: number;
  created_at: string;
}

export interface PollOption {
  id: number;
  poll_id: string;
  idx: number;
  label: string;
}

export interface PollVote {
  poll_id: string;
  option_idx: number;
  user_id: string;
  voted_at: string;
}

export function createPoll(poll: Omit<Poll, 'message_id' | 'created_at'>, options: string[]) {
  const insertPoll = db.prepare(`
    INSERT INTO polls (id, guild_id, channel_id, creator_id, title, mode, anonymous, show_live, closed)
    VALUES (@id, @guild_id, @channel_id, @creator_id, @title, @mode, @anonymous, @show_live, @closed)
  `);
  const insertOption = db.prepare(`
    INSERT INTO poll_options (poll_id, idx, label) VALUES (?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertPoll.run(poll);
    for (let i = 0; i < options.length; i++) {
      insertOption.run(poll.id, i, options[i]);
    }
  });
  tx();
}

export function setPollMessageId(pollId: string, messageId: string) {
  db.prepare('UPDATE polls SET message_id = ? WHERE id = ?').run(messageId, pollId);
}

export function getPoll(pollId: string): Poll | undefined {
  return db.prepare('SELECT * FROM polls WHERE id = ?').get(pollId) as Poll | undefined;
}

export function getPollOptions(pollId: string): PollOption[] {
  return db
    .prepare('SELECT * FROM poll_options WHERE poll_id = ? ORDER BY idx')
    .all(pollId) as PollOption[];
}

export function getPollVotes(pollId: string): PollVote[] {
  return db.prepare('SELECT * FROM poll_votes WHERE poll_id = ?').all(pollId) as PollVote[];
}

export function getUserPollVotes(pollId: string, userId: string): PollVote[] {
  return db
    .prepare('SELECT * FROM poll_votes WHERE poll_id = ? AND user_id = ?')
    .all(pollId, userId) as PollVote[];
}

export function votePollSingle(pollId: string, optionIdx: number, userId: string) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').run(pollId, userId);
    db.prepare('INSERT INTO poll_votes (poll_id, option_idx, user_id) VALUES (?, ?, ?)').run(
      pollId,
      optionIdx,
      userId,
    );
  });
  tx();
}

export function votePollMulti(pollId: string, optionIdxs: number[], userId: string) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').run(pollId, userId);
    const insert = db.prepare(
      'INSERT INTO poll_votes (poll_id, option_idx, user_id) VALUES (?, ?, ?)',
    );
    for (const idx of optionIdxs) {
      insert.run(pollId, idx, userId);
    }
  });
  tx();
}

export function closePoll(pollId: string) {
  db.prepare('UPDATE polls SET closed = 1 WHERE id = ?').run(pollId);
}
