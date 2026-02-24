/**
 * Poll voting flow — handles the vote modal and all submission branches.
 *
 * Vote modal shows:
 * - CheckboxGroup with poll options (pre-selected with user's current votes)
 * - Creator-only CheckboxGroup with Close/Edit actions
 *
 * Submission branches:
 * 1. Creator selected "Edit"  → process vote, send ephemeral edit button
 * 2. Creator selected "Close" → close poll, show final results
 * 3. No options selected      → clear user's votes
 * 4. Options selected         → record vote
 *
 * All branches refresh the poll message embed via deferUpdate + editReply.
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
import type { Poll, PollOption } from '../db/polls.js';
import {
  clearPollVotes,
  closePoll,
  getPoll,
  getPollOptions,
  getPollVotes,
  getUserPollVotes,
  votePollMulti,
  votePollSingle,
} from '../db/polls.js';
import { buildPollComponents } from '../util/components.js';
import { buildPollEmbed } from '../util/embeds.js';
import { parsePollVoteOpen, pollEditOpenId } from '../util/ids.js';
import { getRawModalComponents, getCheckboxValues } from '../util/modal.js';

export const POLL_VOTE_MODAL_PREFIX = 'poll-vote:';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Records a user's vote (single or multi mode) or clears if no labels selected. */
function recordVote(poll: Poll, pollId: string, userId: string, selectedLabels: string[]): void {
  if (selectedLabels.length === 0) {
    clearPollVotes(pollId, userId);
    return;
  }
  if (poll.mode === 'single') {
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
  await interaction.editReply({ embeds: [embed], components });
}

// ---------------------------------------------------------------------------
// Modal open
// ---------------------------------------------------------------------------

/** Opens the vote modal when the "Vote" button is clicked. */
export async function handlePollVoteOpen(interaction: ButtonInteraction) {
  const parsed = parsePollVoteOpen(interaction.customId);
  if (!parsed) return;

  const { pollId } = parsed;
  const poll = getPoll(pollId);
  if (!poll || poll.closed) {
    await interaction.reply({ content: 'This poll is closed.', flags: MessageFlags.Ephemeral });
    return;
  }

  // Pre-select the user's existing votes
  const options = getPollOptions(pollId);
  const userVotes = getUserPollVotes(pollId, interaction.user.id);
  const votedLabels = new Set(userVotes.map((v) => v.option_label));

  const modalOptions = options.map((opt) => ({
    label: `${opt.label}`.slice(0, 100),
    value: opt.label,
    default: votedLabels.has(opt.label),
  }));

  const isSingle = poll.mode === 'single';

  const components: APIModalInteractionResponseCallbackComponent[] = [
    {
      type: ComponentType.Label,
      label: isSingle ? 'Choose an option' : 'Choose one or more options',
      component: {
        type: ComponentType.CheckboxGroup,
        custom_id: 'poll_vote_choice',
        min_values: 0,
        required: false,
        max_values: isSingle ? 1 : options.length,
        options: modalOptions,
      },
    },
  ];

  // Creator-only actions (close / edit) — single select, nothing pre-selected
  if (interaction.user.id === poll.creator_id) {
    components.push({
      type: ComponentType.Label,
      label: 'Creator Options',
      component: {
        type: ComponentType.CheckboxGroup,
        custom_id: 'poll_close',
        min_values: 0,
        max_values: 1,
        required: false,
        options: [
          { label: 'Close this poll', value: 'close', default: false },
          { label: 'Edit this poll', value: 'edit', default: false },
        ],
      },
    });
  }

  const modalPayload: Parameters<ButtonInteraction['showModal']>[0] = {
    title: 'Vote',
    custom_id: `${POLL_VOTE_MODAL_PREFIX}${pollId}`,
    components,
  };

  await interaction.showModal(modalPayload);
}

// ---------------------------------------------------------------------------
// Modal submit
// ---------------------------------------------------------------------------

/** Handles the vote modal submission — routes to the correct branch. */
export async function handlePollVoteModalSubmit(interaction: ModalSubmitInteraction) {
  const pollId = interaction.customId.slice(POLL_VOTE_MODAL_PREFIX.length);
  const poll = getPoll(pollId);
  if (!poll || poll.closed) {
    await interaction.reply({ content: 'This poll is closed.', flags: MessageFlags.Ephemeral });
    return;
  }

  const rawComponents = getRawModalComponents(interaction);
  const options = getPollOptions(pollId);
  const voteLabels = getCheckboxValues(rawComponents, 'poll_vote_choice');
  const creatorAction = getCheckboxValues(rawComponents, 'poll_close')[0];

  // --- Branch: Creator chose "Edit" ---
  if (creatorAction === 'edit' && interaction.user.id === poll.creator_id) {
    recordVote(poll, pollId, interaction.user.id, voteLabels);
    await refreshPollMessage(interaction, poll, options, pollId);

    // Send ephemeral button to open the edit modal
    const editRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(pollEditOpenId(pollId))
        .setLabel('Open Edit Modal')
        .setStyle(ButtonStyle.Secondary),
    );
    await interaction.followUp({
      content: 'Click below to edit this poll.',
      components: [editRow],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // --- Branch: Creator chose "Close" ---
  if (creatorAction === 'close' && interaction.user.id === poll.creator_id) {
    closePoll(pollId);
    const updatedPoll = getPoll(pollId)!;
    const votes = getPollVotes(pollId);
    const embed = buildPollEmbed(updatedPoll, options, votes, true);

    await interaction.deferUpdate();
    await interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  // --- Branch: Regular vote ---
  recordVote(poll, pollId, interaction.user.id, voteLabels);
  await refreshPollMessage(interaction, poll, options, pollId);

  // Ephemeral confirmation when results aren't live
  if (!poll.show_live) {
    const message =
      voteLabels.length === 0
        ? 'Your vote has been cleared.'
        : `Vote recorded for **${voteLabels.join(', ')}**!`;
    await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
  }
}
