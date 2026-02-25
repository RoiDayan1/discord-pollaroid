/**
 * Poll voting flow — handles the vote modal and submission.
 *
 * Creator flow:
 * 1. Creator clicks "Vote" → ephemeral with Vote / Edit / Close buttons
 * 2. "Vote" opens the vote modal, "Edit" opens edit modal, "Close" closes poll
 *
 * Non-creator flow:
 * 1. User clicks "Vote" → vote modal opens directly
 *
 * The creator session stores the original button interaction so the poll
 * message can be refreshed after actions taken from the ephemeral.
 */

import {
  ActionRowBuilder,
  APIModalInteractionResponseCallbackComponent,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  ComponentType,
  type MessageActionRowComponentBuilder,
  MessageFlags,
  type ModalSubmitInteraction,
} from 'discord.js';
import { PollMode } from '../util/constants.js';
import type { Poll, PollOption } from '../db/polls.js';
import {
  clearPollVotes,
  getPoll,
  getPollOptions,
  getPollVotes,
  getUserPollVotes,
  votePollMulti,
  votePollSingle,
} from '../db/polls.js';
import { buildPollComponents } from '../util/components.js';
import { buildMessageContent, buildPollEmbed } from '../util/embeds.js';
import {
  parsePollVoteOpen,
  parsePollVoteGo,
  pollVoteGoId,
  pollEditOpenId,
  pollCloseId,
  POLL_VOTE_MODAL_PREFIX,
  MODAL_POLL_VOTE_CHOICE,
} from '../util/ids.js';
import { getRawModalComponents, getCheckboxValues } from '../util/modal.js';

// ---------------------------------------------------------------------------
// Creator session map
// ---------------------------------------------------------------------------

/** In-memory creator sessions — keyed by "pollId:userId". */
export const pollCreatorSessions = new Map<
  string,
  {
    pollId: string;
    /** The original button interaction on the poll message, used to refresh the embed. */
    pollInteraction: ButtonInteraction;
  }
>();

function sessionKey(pollId: string, userId: string): string {
  return `${pollId}:${userId}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Records a user's vote (single or multi mode) or clears if no labels selected. */
function recordVote(poll: Poll, pollId: string, userId: string, selectedLabels: string[]): void {
  if (selectedLabels.length === 0) {
    clearPollVotes(pollId, userId);
    return;
  }
  if (poll.mode === PollMode.Single) {
    votePollSingle(pollId, selectedLabels[0], userId);
  } else {
    votePollMulti(pollId, selectedLabels, userId);
  }
}

/** Rebuilds the poll embed and updates the poll message in-place. */
async function refreshPollMessage(
  interaction: ModalSubmitInteraction,
  poll: Poll,
  options: PollOption[],
  pollId: string,
): Promise<void> {
  const votes = getPollVotes(pollId);
  const embed = buildPollEmbed(poll, options, votes, !!poll.show_live);
  const components = buildPollComponents(pollId);
  await interaction.deferUpdate();
  await interaction.editReply({
    ...buildMessageContent(poll.title, poll.mentions),
    embeds: [embed],
    components,
  });
}

/** Opens the vote modal (without creator options). */
async function showVoteModal(
  interaction: ButtonInteraction,
  poll: Poll,
  pollId: string,
): Promise<void> {
  const options = getPollOptions(pollId);
  const userVotes = getUserPollVotes(pollId, interaction.user.id);
  const votedLabels = new Set(userVotes.map((v) => v.option_label));

  const modalOptions = options.map((opt) => ({
    label: `${opt.label}`.slice(0, 100),
    value: opt.label,
    default: votedLabels.has(opt.label),
  }));

  const isSingle = poll.mode === PollMode.Single;

  const components: APIModalInteractionResponseCallbackComponent[] = [
    {
      type: ComponentType.Label,
      label: isSingle ? 'Choose an option' : 'Choose one or more options',
      component: {
        type: ComponentType.CheckboxGroup,
        custom_id: MODAL_POLL_VOTE_CHOICE,
        min_values: 0,
        required: false,
        max_values: isSingle ? 1 : options.length,
        options: modalOptions,
      },
    },
  ];

  const modalPayload: Parameters<ButtonInteraction['showModal']>[0] = {
    title: 'Vote',
    custom_id: `${POLL_VOTE_MODAL_PREFIX}${pollId}`,
    components,
  };

  await interaction.showModal(modalPayload);
}

// ---------------------------------------------------------------------------
// Vote button — modal open or creator ephemeral
// ---------------------------------------------------------------------------

/** Handles the "Vote" button on the poll message. */
export async function handlePollVoteOpen(interaction: ButtonInteraction) {
  const parsed = parsePollVoteOpen(interaction.customId);
  if (!parsed) return;

  const { pollId } = parsed;
  const poll = getPoll(pollId);
  if (!poll || poll.closed) {
    await interaction.reply({ content: 'This poll is closed.', flags: MessageFlags.Ephemeral });
    return;
  }

  // Creator: show ephemeral with Vote / Edit / Close buttons
  if (interaction.user.id === poll.creator_id) {
    await interaction.deferUpdate();
    const key = sessionKey(pollId, interaction.user.id);
    pollCreatorSessions.set(key, { pollId, pollInteraction: interaction });

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(pollVoteGoId(pollId))
        .setLabel('Vote')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(pollEditOpenId(pollId))
        .setLabel('Edit Poll')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(pollCloseId(pollId))
        .setLabel('Close Poll')
        .setStyle(ButtonStyle.Danger),
    );

    await interaction.followUp({
      content: 'What would you like to do?',
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Non-creator: open vote modal directly
  await showVoteModal(interaction, poll, pollId);
}

// ---------------------------------------------------------------------------
// Creator ephemeral — "Vote" button
// ---------------------------------------------------------------------------

/** Creator clicked "Vote" on the ephemeral — opens the vote modal. */
export async function handlePollVoteGo(interaction: ButtonInteraction) {
  const parsed = parsePollVoteGo(interaction.customId);
  if (!parsed) return;

  const { pollId } = parsed;
  const poll = getPoll(pollId);
  if (!poll || poll.closed) {
    await interaction.reply({ content: 'This poll is closed.', flags: MessageFlags.Ephemeral });
    return;
  }

  await showVoteModal(interaction, poll, pollId);
}

// ---------------------------------------------------------------------------
// Modal submit
// ---------------------------------------------------------------------------

/** Handles the vote modal submission — records vote and refreshes the poll message. */
export async function handlePollVoteModalSubmit(interaction: ModalSubmitInteraction) {
  const pollId = interaction.customId.slice(POLL_VOTE_MODAL_PREFIX.length);
  const poll = getPoll(pollId);
  if (!poll || poll.closed) {
    await interaction.reply({ content: 'This poll is closed.', flags: MessageFlags.Ephemeral });
    return;
  }

  const rawComponents = getRawModalComponents(interaction);
  const options = getPollOptions(pollId);
  const voteLabels = getCheckboxValues(rawComponents, MODAL_POLL_VOTE_CHOICE);

  recordVote(poll, pollId, interaction.user.id, voteLabels);

  // Check if we have a creator session (modal opened from the ephemeral)
  const key = sessionKey(pollId, interaction.user.id);
  const session = pollCreatorSessions.get(key);

  if (session?.pollInteraction) {
    // Refresh the poll message via the stored interaction
    const votes = getPollVotes(pollId);
    const embed = buildPollEmbed(poll, options, votes, !!poll.show_live);
    const components = buildPollComponents(pollId);
    try {
      await session.pollInteraction.editReply({
        ...buildMessageContent(poll.title, poll.mentions),
        embeds: [embed],
        components,
      });
    } catch {
      // Token may have expired — embed will refresh on next interaction
    }

    const message =
      voteLabels.length === 0
        ? 'Your vote has been cleared.'
        : `Vote recorded for **${voteLabels.join(', ')}**!`;
    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
  } else {
    // Non-creator path — refresh via deferUpdate + editReply
    await refreshPollMessage(interaction, poll, options, pollId);

    if (!poll.show_live) {
      const message =
        voteLabels.length === 0
          ? 'Your vote has been cleared.'
          : `Vote recorded for **${voteLabels.join(', ')}**!`;
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
    }
  }
}
