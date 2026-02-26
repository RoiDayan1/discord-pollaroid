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

export async function createRank(rank: Omit<Rank, 'message_id' | 'created_at'>, options: string[]) {
  await db.transaction(async (trx) => {
    await trx('ranks').insert(rank);
    for (let i = 0; i < options.length; i++) {
      await trx('rank_options').insert({
        rank_id: rank.id,
        idx: i,
        label: options[i],
      });
    }
  });
}

export async function setRankMessageId(rankId: string, messageId: string) {
  await db('ranks').where('id', rankId).update({ message_id: messageId });
}

export async function getRank(rankId: string): Promise<Rank | undefined> {
  return db<Rank>('ranks').where('id', rankId).first();
}

export async function getRankOptions(rankId: string): Promise<RankOption[]> {
  return db<RankOption>('rank_options').where('rank_id', rankId).orderBy('idx');
}

export async function getRankVotes(rankId: string): Promise<RankVote[]> {
  return db<RankVote>('rank_votes').where('rank_id', rankId);
}

export async function getUserRankVotes(rankId: string, userId: string): Promise<RankVote[]> {
  return db<RankVote>('rank_votes').where({ rank_id: rankId, user_id: userId });
}

export async function voteRankStar(
  rankId: string,
  optionIdx: number,
  userId: string,
  stars: number,
) {
  await db.transaction(async (trx) => {
    await trx('rank_votes')
      .where({ rank_id: rankId, option_idx: optionIdx, user_id: userId })
      .del();
    await trx('rank_votes').insert({
      rank_id: rankId,
      option_idx: optionIdx,
      user_id: userId,
      value: stars,
    });
  });
}

export async function voteRankOrder(
  rankId: string,
  userId: string,
  ordering: { optionIdx: number; position: number }[],
) {
  await db.transaction(async (trx) => {
    await trx('rank_votes').where({ rank_id: rankId, user_id: userId }).del();
    for (const { optionIdx, position } of ordering) {
      await trx('rank_votes').insert({
        rank_id: rankId,
        option_idx: optionIdx,
        user_id: userId,
        value: position,
      });
    }
  });
}

export async function getOpenRanksByCreator(creatorId: string, channelId: string): Promise<Rank[]> {
  return db<Rank>('ranks').where({ creator_id: creatorId, channel_id: channelId, closed: 0 });
}

export async function updateRank(
  rankId: string,
  updates: {
    title: string;
    mode: RankMode;
    anonymous: number;
    show_live: number;
    mentions: string;
    options: string[];
  },
): Promise<boolean> {
  let votesCleared = false;

  await db.transaction(async (trx) => {
    const currentRank = await trx<Rank>('ranks').where('id', rankId).first();
    if (!currentRank) return;

    await trx('ranks').where('id', rankId).update({
      title: updates.title,
      mode: updates.mode,
      anonymous: updates.anonymous,
      show_live: updates.show_live,
      mentions: updates.mentions,
    });

    const currentOptions = await trx<RankOption>('rank_options')
      .where('rank_id', rankId)
      .orderBy('idx');
    const oldLabels = currentOptions.map((o) => o.label);
    const newLabels = updates.options;
    const optionsChanged =
      oldLabels.length !== newLabels.length || oldLabels.some((l, i) => l !== newLabels[i]);
    const modeChanged = currentRank.mode !== updates.mode;

    // Rank votes are keyed by option_idx, so any option change invalidates indices.
    // Order mode rankings depend on the full set. Mode changes make votes semantically invalid.
    if (modeChanged || optionsChanged) {
      const changes = await trx('rank_votes').where('rank_id', rankId).del();
      if (changes > 0) votesCleared = true;
    }

    if (optionsChanged) {
      await trx('rank_options').where('rank_id', rankId).del();
      for (let i = 0; i < updates.options.length; i++) {
        await trx('rank_options').insert({
          rank_id: rankId,
          idx: i,
          label: updates.options[i],
        });
      }
    }
  });

  return votesCleared;
}

export async function closeRank(rankId: string) {
  await db('ranks').where('id', rankId).update({ closed: 1 });
}
