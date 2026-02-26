import { PollMode } from '../util/constants.js';
import type { ParsedOption } from '../util/validation.js';
import db from './connection.js';

export interface Poll {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  creator_id: string;
  title: string;
  mode: PollMode;
  anonymous: number;
  show_live: number;
  mentions: string;
  closed: number;
  created_at: string;
}

export interface PollOption {
  id: number;
  poll_id: string;
  idx: number;
  label: string;
  target: number | null;
}

export interface PollVote {
  poll_id: string;
  option_label: string;
  user_id: string;
  voted_at: string;
}

export async function createPoll(
  poll: Omit<Poll, 'message_id' | 'created_at'>,
  options: ParsedOption[],
) {
  await db.transaction(async (trx) => {
    await trx('polls').insert(poll);
    for (let i = 0; i < options.length; i++) {
      await trx('poll_options').insert({
        poll_id: poll.id,
        idx: i,
        label: options[i].label,
        target: options[i].target,
      });
    }
  });
}

export async function setPollMessageId(pollId: string, messageId: string) {
  await db('polls').where('id', pollId).update({ message_id: messageId });
}

export async function getPoll(pollId: string): Promise<Poll | undefined> {
  return db<Poll>('polls').where('id', pollId).first();
}

export async function getPollOptions(pollId: string): Promise<PollOption[]> {
  return db<PollOption>('poll_options').where('poll_id', pollId).orderBy('idx');
}

export async function getPollVotes(pollId: string): Promise<PollVote[]> {
  return db<PollVote>('poll_votes').where('poll_id', pollId);
}

export async function getUserPollVotes(pollId: string, userId: string): Promise<PollVote[]> {
  return db<PollVote>('poll_votes').where({ poll_id: pollId, user_id: userId });
}

export async function votePollSingle(pollId: string, optionLabel: string, userId: string) {
  await db.transaction(async (trx) => {
    await trx('poll_votes').where({ poll_id: pollId, user_id: userId }).del();
    await trx('poll_votes').insert({
      poll_id: pollId,
      option_label: optionLabel,
      user_id: userId,
    });
  });
}

export async function votePollMulti(pollId: string, optionLabels: string[], userId: string) {
  await db.transaction(async (trx) => {
    await trx('poll_votes').where({ poll_id: pollId, user_id: userId }).del();
    for (const label of optionLabels) {
      await trx('poll_votes').insert({
        poll_id: pollId,
        option_label: label,
        user_id: userId,
      });
    }
  });
}

export async function clearPollVotes(pollId: string, userId: string) {
  await db('poll_votes').where({ poll_id: pollId, user_id: userId }).del();
}

export async function getOpenPollsByCreator(creatorId: string, channelId: string): Promise<Poll[]> {
  return db<Poll>('polls').where({ creator_id: creatorId, channel_id: channelId, closed: 0 });
}

export async function updatePoll(
  pollId: string,
  updates: {
    title: string;
    mode: PollMode;
    anonymous: number;
    show_live: number;
    mentions: string;
    options: ParsedOption[];
  },
): Promise<boolean> {
  let votesCleared = false;

  await db.transaction(async (trx) => {
    const currentPoll = await trx<Poll>('polls').where('id', pollId).first();
    if (!currentPoll) return;

    await trx('polls').where('id', pollId).update({
      title: updates.title,
      mode: updates.mode,
      anonymous: updates.anonymous,
      show_live: updates.show_live,
      mentions: updates.mentions,
    });

    const currentOptions = await trx<PollOption>('poll_options')
      .where('poll_id', pollId)
      .orderBy('idx');
    const oldLabels = new Set(currentOptions.map((o) => o.label));
    const newLabels = new Set(updates.options.map((o) => o.label));
    const optionsChanged =
      oldLabels.size !== newLabels.size || [...oldLabels].some((l) => !newLabels.has(l));
    const modeChanged = currentPoll.mode !== updates.mode;

    // Single→multi is fine, but multi→single may leave users with multiple votes
    if (modeChanged && updates.mode === PollMode.Single) {
      await trx('poll_votes').where('poll_id', pollId).del();
      votesCleared = true;
    } else if (optionsChanged) {
      // Remove votes for options that no longer exist
      const removedLabels = [...oldLabels].filter((l) => !newLabels.has(l));
      if (removedLabels.length > 0) {
        const changes = await trx('poll_votes')
          .where('poll_id', pollId)
          .whereIn('option_label', removedLabels)
          .del();
        if (changes > 0) votesCleared = true;
      }
    }

    if (optionsChanged) {
      await trx('poll_options').where('poll_id', pollId).del();
      for (let i = 0; i < updates.options.length; i++) {
        await trx('poll_options').insert({
          poll_id: pollId,
          idx: i,
          label: updates.options[i].label,
          target: updates.options[i].target,
        });
      }
    } else {
      // Labels unchanged — update targets in-place without clearing votes
      for (const opt of updates.options) {
        await trx('poll_options')
          .where({ poll_id: pollId, label: opt.label })
          .update({ target: opt.target });
      }
    }
  });

  return votesCleared;
}

export async function getPollVoteCounts(pollId: string): Promise<Map<string, number>> {
  const rows = await db('poll_votes')
    .where('poll_id', pollId)
    .groupBy('option_label')
    .select('option_label', db.raw('COUNT(*) as count'));
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.option_label, Number(row.count));
  }
  return map;
}

export async function closePoll(pollId: string) {
  await db('polls').where('id', pollId).update({ closed: 1 });
}
