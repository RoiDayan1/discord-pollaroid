/**
 * Poll edit flow — allows the poll creator to modify a live poll.
 *
 * Flow: Vote modal → creator selects "Edit" → ephemeral "Open Edit Modal"
 * button → creator clicks → edit modal (pre-filled) → submit → DB updated.
 *
 * The poll message is refreshed via channel-based editing using the
 * message_id stored in the database.
 */

import {
  type APIModalInteractionResponseCallbackComponent,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  ComponentType,
  MessageFlags,
  SelectMenuDefaultValueType,
  TextInputStyle,
} from 'discord.js';
import { getPoll, getPollOptions, getPollVotes, updatePoll } from '../db/polls.js';
import { buildPollComponents } from '../util/components.js';
import { EVERYONE_SENTINEL, PollMode, Setting } from '../util/constants.js';
import { buildMessageContent, buildPollEmbed } from '../util/embeds.js';
import {
  MODAL_POLL_MENTIONS,
  MODAL_POLL_MODE,
  MODAL_POLL_OPTIONS,
  MODAL_POLL_SETTINGS,
  MODAL_POLL_TITLE,
  parsePollEditOpen,
  POLL_EDIT_MODAL_PREFIX,
} from '../util/ids.js';
import { editChannelMessage } from '../util/messages.js';
import { getCheckboxValues, getRawModalComponents, getRoleSelectValues } from '../util/modal.js';
import { parseOptionsWithTargets, validatePollOptions } from '../util/validation.js';

/** Handles the "Open Edit Modal" button click — shows a pre-filled edit modal. */
export async function handlePollEditButton(interaction: ButtonInteraction) {
  const parsed = parsePollEditOpen(interaction.customId);
  if (!parsed) return;

  const { pollId } = parsed;
  const poll = getPoll(pollId);

  if (!poll || poll.closed) {
    await interaction.reply({ content: 'This poll is closed.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.id !== poll.creator_id) {
    await interaction.reply({
      content: 'Only the poll creator can edit.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Pre-fill modal with current poll values
  const options = getPollOptions(pollId);
  const optionText = options
    .map((o) => (o.target !== null ? `${o.label} /${o.target}` : o.label))
    .join('\n');
  const currentMentions: string[] = JSON.parse(poll.mentions);
  const hasEveryone = currentMentions.includes(EVERYONE_SENTINEL);
  const roleOnlyMentions = currentMentions.filter((id) => id !== EVERYONE_SENTINEL);

  const components: APIModalInteractionResponseCallbackComponent[] = [
    {
      type: ComponentType.Label,
      label: 'Poll Question',
      component: {
        type: ComponentType.TextInput,
        custom_id: MODAL_POLL_TITLE,
        style: TextInputStyle.Short,
        value: poll.title,
        required: true,
      },
    },
    {
      type: ComponentType.Label,
      label: 'Options',
      description: 'One per line. Add /N for a vote target',
      component: {
        type: ComponentType.TextInput,
        custom_id: MODAL_POLL_OPTIONS,
        style: TextInputStyle.Paragraph,
        value: optionText,
        required: true,
      },
    },
    {
      type: ComponentType.Label,
      label: 'Voting Mode',
      component: {
        type: ComponentType.CheckboxGroup,
        custom_id: MODAL_POLL_MODE,
        min_values: 1,
        max_values: 1,
        options: [
          { label: 'Single Choice', value: 'single', default: poll.mode === 'single' },
          { label: 'Multiple Choice', value: 'multi', default: poll.mode === 'multi' },
        ],
      },
    },
    {
      type: ComponentType.Label,
      label: 'Settings',
      component: {
        type: ComponentType.CheckboxGroup,
        custom_id: MODAL_POLL_SETTINGS,
        min_values: 0,
        max_values: 3,
        required: false,
        options: [
          {
            label: 'Anonymous',
            value: 'anonymous',
            description: 'Hide voter names',
            default: !!poll.anonymous,
          },
          {
            label: 'Show Live Results',
            value: 'show_live',
            description: 'Show results before closing',
            default: !!poll.show_live,
          },
          {
            label: 'Mention @everyone',
            value: 'mention_everyone',
            description: 'Notify everyone in the channel',
            default: hasEveryone,
          },
        ],
      },
    },
    {
      type: ComponentType.Label,
      label: 'Mention Roles',
      description: 'Optional — mentioned roles will be notified',
      component: {
        type: ComponentType.RoleSelect,
        custom_id: MODAL_POLL_MENTIONS,
        min_values: 0,
        max_values: 25,
        required: false,
        default_values: roleOnlyMentions.map((id) => ({
          type: SelectMenuDefaultValueType.Role,
          id,
        })),
      },
    },
  ];

  const modalPayload: Parameters<ButtonInteraction['showModal']>[0] = {
    title: 'Edit Poll',
    custom_id: `${POLL_EDIT_MODAL_PREFIX}${pollId}`,
    components,
  };

  await interaction.showModal(modalPayload);
}

/** Handles the edit modal submission — validates, updates DB, sends confirmation. */
export async function handlePollEditModalSubmit(interaction: ModalSubmitInteraction) {
  const pollId = interaction.customId.slice(POLL_EDIT_MODAL_PREFIX.length);
  const poll = getPoll(pollId);

  if (!poll || poll.closed) {
    await interaction.reply({ content: 'This poll is closed.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.id !== poll.creator_id) {
    await interaction.reply({
      content: 'Only the poll creator can edit.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Extract form values
  const title = interaction.fields.getTextInputValue(MODAL_POLL_TITLE);
  const optionsRaw = interaction.fields.getTextInputValue(MODAL_POLL_OPTIONS);
  const rawComponents = getRawModalComponents(interaction);

  const modeValues = getCheckboxValues(rawComponents, MODAL_POLL_MODE) as PollMode[];
  const settingsValues = getCheckboxValues(rawComponents, MODAL_POLL_SETTINGS) as Setting[];

  const mode = modeValues[0] ?? PollMode.Single;
  const anonymous = settingsValues.includes(Setting.Anonymous);
  const showLive = settingsValues.includes(Setting.ShowLive);
  const mentionRoleIds: string[] = getRoleSelectValues(rawComponents, MODAL_POLL_MENTIONS);
  if (settingsValues.includes(Setting.MentionEveryone)) mentionRoleIds.unshift(EVERYONE_SENTINEL);
  const mentions = JSON.stringify(mentionRoleIds);

  // Validate options
  const options = parseOptionsWithTargets(optionsRaw);
  const error = validatePollOptions(options);
  if (error) {
    await interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
    return;
  }

  // Update DB — may clear votes if options/mode changed
  const votesCleared = updatePoll(pollId, {
    title,
    mode,
    anonymous: anonymous ? 1 : 0,
    show_live: showLive ? 1 : 0,
    mentions,
    options,
  });

  let content = 'Poll updated!';
  if (votesCleared) {
    content += ' Some votes were cleared due to removed options or voting mode change.';
  }

  await interaction.reply({ content, flags: MessageFlags.Ephemeral });

  // Refresh the poll message via channel editing
  const updatedPoll = getPoll(pollId)!;
  const updatedOptions = getPollOptions(pollId);
  const votes = getPollVotes(pollId);
  const embed = buildPollEmbed(updatedPoll, updatedOptions, votes, !!updatedPoll.show_live);
  const components = buildPollComponents(pollId);

  await editChannelMessage(interaction, updatedPoll.channel_id, updatedPoll.message_id, {
    ...buildMessageContent(updatedPoll.title, updatedPoll.mentions),
    embeds: [embed],
    components,
  });
}
