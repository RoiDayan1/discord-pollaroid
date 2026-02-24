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
  option_label: string;
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

export function votePollSingle(pollId: string, optionLabel: string, userId: string) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').run(pollId, userId);
    db.prepare('INSERT INTO poll_votes (poll_id, option_label, user_id) VALUES (?, ?, ?)').run(
      pollId,
      optionLabel,
      userId,
    );
  });
  tx();
}

export function votePollMulti(pollId: string, optionLabels: string[], userId: string) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').run(pollId, userId);
    const insert = db.prepare(
      'INSERT INTO poll_votes (poll_id, option_label, user_id) VALUES (?, ?, ?)',
    );
    for (const label of optionLabels) {
      insert.run(pollId, label, userId);
    }
  });
  tx();
}

export function clearPollVotes(pollId: string, userId: string) {
  db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').run(pollId, userId);
}

export function getOpenPollsByCreator(creatorId: string, channelId: string): Poll[] {
  return db
    .prepare('SELECT * FROM polls WHERE creator_id = ? AND channel_id = ? AND closed = 0')
    .all(creatorId, channelId) as Poll[];
}

export function updatePoll(
  pollId: string,
  updates: {
    title: string;
    mode: 'single' | 'multi';
    anonymous: number;
    show_live: number;
    options: string[];
  },
): boolean {
  let votesCleared = false;
  const tx = db.transaction(() => {
    const currentPoll = getPoll(pollId);
    if (!currentPoll) return;

    db.prepare(
      'UPDATE polls SET title = ?, mode = ?, anonymous = ?, show_live = ? WHERE id = ?',
    ).run(updates.title, updates.mode, updates.anonymous, updates.show_live, pollId);

    const currentOptions = getPollOptions(pollId);
    const oldLabels = new Set(currentOptions.map((o) => o.label));
    const newLabels = new Set(updates.options);
    const optionsChanged =
      oldLabels.size !== newLabels.size || [...oldLabels].some((l) => !newLabels.has(l));
    const modeChanged = currentPoll.mode !== updates.mode;

    // Single→multi is fine, but multi→single may leave users with multiple votes
    if (modeChanged && updates.mode === 'single') {
      db.prepare('DELETE FROM poll_votes WHERE poll_id = ?').run(pollId);
      votesCleared = true;
    } else if (optionsChanged) {
      // Remove votes for options that no longer exist
      const removedLabels = [...oldLabels].filter((l) => !newLabels.has(l));
      if (removedLabels.length > 0) {
        const placeholders = removedLabels.map(() => '?').join(', ');
        const result = db
          .prepare(`DELETE FROM poll_votes WHERE poll_id = ? AND option_label IN (${placeholders})`)
          .run(pollId, ...removedLabels);
        if (result.changes > 0) votesCleared = true;
      }
    }

    if (optionsChanged) {
      db.prepare('DELETE FROM poll_options WHERE poll_id = ?').run(pollId);
      const insertOption = db.prepare(
        'INSERT INTO poll_options (poll_id, idx, label) VALUES (?, ?, ?)',
      );
      for (let i = 0; i < updates.options.length; i++) {
        insertOption.run(pollId, i, updates.options[i]);
      }
    }
  });
  tx();
  return votesCleared;
}

export function closePoll(pollId: string) {
  db.prepare('UPDATE polls SET closed = 1 WHERE id = ?').run(pollId);
}
