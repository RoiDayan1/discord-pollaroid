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
 * The poll message is refreshed via channel-based editing using the
 * message_id stored in the database.
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
  getPollVoteCounts,
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
import { editChannelMessage } from '../util/messages.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Records a user's vote (single or multi mode) or clears if no labels selected. */
async function recordVote(
  poll: Poll,
  pollId: string,
  userId: string,
  selectedLabels: string[],
): Promise<void> {
  if (selectedLabels.length === 0) {
    await clearPollVotes(pollId, userId);
    return;
  }
  if (poll.mode === PollMode.Single) {
    await votePollSingle(pollId, selectedLabels[0], userId);
  } else {
    await votePollMulti(pollId, selectedLabels, userId);
  }
}

/** Builds the poll message payload (embed + components + content). */
async function buildPollPayload(poll: Poll, options: PollOption[], pollId: string) {
  const votes = await getPollVotes(pollId);
  const embed = buildPollEmbed(poll, options, votes, !!poll.show_live);
  const components = buildPollComponents(pollId);
  return {
    ...buildMessageContent(poll.title, poll.mentions),
    embeds: [embed],
    components,
  };
}

/** Opens the vote modal (without creator options). */
async function showVoteModal(
  interaction: ButtonInteraction,
  poll: Poll,
  pollId: string,
): Promise<void> {
  const options = await getPollOptions(pollId);
  const userVotes = await getUserPollVotes(pollId, interaction.user.id);
  const votedLabels = new Set(userVotes.map((v) => v.option_label));
  const voteCounts = await getPollVoteCounts(pollId);

  // Filter: include option if no target, not full, or user already voted for it
  const availableOptions = options.filter((opt) => {
    if (opt.target === null) return true;
    const count = voteCounts.get(opt.label) ?? 0;
    if (count < opt.target) return true;
    return votedLabels.has(opt.label);
  });

  if (availableOptions.length === 0) {
    await interaction.reply({
      content: 'All options have reached their targets. No slots available.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modalOptions = availableOptions.map((opt) => ({
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
        max_values: isSingle ? 1 : availableOptions.length,
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
  const poll = await getPoll(pollId);
  if (!poll || poll.closed) {
    await interaction.reply({ content: 'This poll is closed.', flags: MessageFlags.Ephemeral });
    return;
  }

  // Creator: ephemeral with Vote / Edit / Close buttons
  if (interaction.user.id === poll.creator_id) {
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

    await interaction.reply({
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
  const poll = await getPoll(pollId);
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
  const poll = await getPoll(pollId);
  if (!poll || poll.closed) {
    await interaction.reply({ content: 'This poll is closed.', flags: MessageFlags.Ephemeral });
    return;
  }

  const rawComponents = getRawModalComponents(interaction);
  const options = await getPollOptions(pollId);
  const voteLabels = getCheckboxValues(rawComponents, MODAL_POLL_VOTE_CHOICE);

  // Server-side enforcement: reject new votes for filled options
  if (voteLabels.length > 0) {
    const voteCounts = await getPollVoteCounts(pollId);
    const prevVotes = await getUserPollVotes(pollId, interaction.user.id);
    const prevLabels = new Set(prevVotes.map((v) => v.option_label));

    const blockedLabels: string[] = [];
    for (const label of voteLabels) {
      const opt = options.find((o) => o.label === label);
      if (opt?.target !== null && opt?.target !== undefined) {
        const count = voteCounts.get(label) ?? 0;
        if (count >= opt.target && !prevLabels.has(label)) {
          blockedLabels.push(label);
        }
      }
    }

    if (blockedLabels.length > 0) {
      await interaction.reply({
        content: `These options are full and cannot accept new votes: **${blockedLabels.join(', ')}**. Please try again.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  await recordVote(poll, pollId, interaction.user.id, voteLabels);

  const message =
    voteLabels.length === 0
      ? 'Your vote has been cleared.'
      : `Vote recorded for **${voteLabels.join(', ')}**!`;

  if (interaction.user.id === poll.creator_id) {
    // Creator path: modal was opened from ephemeral — reply with confirmation,
    // then refresh the poll message via channel editing
    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    await editChannelMessage(
      interaction,
      poll.channel_id,
      poll.message_id,
      await buildPollPayload(poll, options, pollId),
    );
  } else {
    // Non-creator path: modal was opened from the poll message button —
    // deferUpdate + editReply updates the poll message directly
    await interaction.deferUpdate();
    await interaction.editReply(await buildPollPayload(poll, options, pollId));

    if (!poll.show_live) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
    }
  }
}
