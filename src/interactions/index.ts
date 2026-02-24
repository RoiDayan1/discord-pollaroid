/**
 * Interaction router — matches button/select menu customIds to handlers.
 * CustomId format: <type>:<nanoid>:<action>[:<params>]
 */

import type { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import { handlePollVoteOpen, handlePollVoteGo } from './poll-vote.js';
import { handlePollClose } from './poll-close.js';
import { handlePollEditButton } from './poll-edit.js';
import {
  handleRankStarVoteOpen,
  handleRankOrderStart,
  handleRankOrderStep,
  handleRankOrderGo,
  handleRankOrderClose,
} from './rank-vote.js';
import { handleRankClose } from './rank-close.js';
import { safeErrorReply } from '../util/errors.js';
import {
  POLL_VOTE_OPEN_RE,
  POLL_VOTE_GO_RE,
  POLL_CLOSE_RE,
  POLL_EDIT_OPEN_RE,
  RANK_RATE_RE,
  RANK_ORDER_START_RE,
  RANK_ORDER_GO_RE,
  RANK_ORDER_CLOSE_RE,
  RANK_ORDER_STEP_RE,
  RANK_CLOSE_RE,
} from '../util/ids.js';

export async function routeInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
) {
  const id = interaction.customId;

  try {
    // Poll interactions
    if (POLL_VOTE_OPEN_RE.test(id)) {
      return await handlePollVoteOpen(interaction as ButtonInteraction);
    }
    if (POLL_VOTE_GO_RE.test(id)) {
      return await handlePollVoteGo(interaction as ButtonInteraction);
    }
    if (POLL_CLOSE_RE.test(id)) {
      return await handlePollClose(interaction as ButtonInteraction);
    }
    if (POLL_EDIT_OPEN_RE.test(id)) {
      return await handlePollEditButton(interaction as ButtonInteraction);
    }

    // Rank interactions
    if (RANK_RATE_RE.test(id)) {
      return await handleRankStarVoteOpen(interaction as ButtonInteraction);
    }
    if (RANK_ORDER_START_RE.test(id)) {
      return await handleRankOrderStart(interaction as ButtonInteraction);
    }
    if (RANK_ORDER_GO_RE.test(id)) {
      return await handleRankOrderGo(interaction as ButtonInteraction);
    }
    if (RANK_ORDER_CLOSE_RE.test(id)) {
      return await handleRankOrderClose(interaction as ButtonInteraction);
    }
    if (RANK_ORDER_STEP_RE.test(id)) {
      return await handleRankOrderStep(interaction as StringSelectMenuInteraction);
    }
    if (RANK_CLOSE_RE.test(id)) {
      return await handleRankClose(interaction as ButtonInteraction);
    }
  } catch (err: unknown) {
    console.error(`Error handling interaction ${id}:`, err);
    await safeErrorReply(interaction);
  }
}
