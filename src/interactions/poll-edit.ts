/**
 * Poll edit flow — allows the poll creator to modify a live poll.
 *
 * Flow: Vote modal → creator selects "Edit" → ephemeral "Open Edit Modal"
 * button → creator clicks → edit modal (pre-filled) → submit → DB updated.
 *
 * The poll message auto-refreshes on the next vote interaction because all
 * vote paths rebuild the embed from current DB state.
 */

import {
  type APIModalInteractionResponseCallbackComponent,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  ComponentType,
  TextInputStyle,
  MessageFlags,
} from 'discord.js';
import { getPoll, getPollOptions, updatePoll } from '../db/polls.js';
import { parsePollEditOpen } from '../util/ids.js';
import { getRawModalComponents, getCheckboxValues } from '../util/modal.js';
import { parseOptions, validatePollOptions } from '../util/validation.js';

export const POLL_EDIT_MODAL_PREFIX = 'poll-edit:';

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
  const optionText = options.map((o) => o.label).join('\n');

  const components: APIModalInteractionResponseCallbackComponent[] = [
    {
      type: ComponentType.Label,
      label: 'Poll Question',
      component: {
        type: ComponentType.TextInput,
        custom_id: 'poll_title',
        style: TextInputStyle.Short,
        value: poll.title,
        required: true,
      },
    },
    {
      type: ComponentType.Label,
      label: 'Options',
      description: 'One option per line (2-20 options)',
      component: {
        type: ComponentType.TextInput,
        custom_id: 'poll_options',
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
        custom_id: 'poll_mode',
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
        custom_id: 'poll_settings',
        min_values: 0,
        max_values: 2,
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
        ],
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
  const title = interaction.fields.getTextInputValue('poll_title');
  const optionsRaw = interaction.fields.getTextInputValue('poll_options');
  const rawComponents = getRawModalComponents(interaction);

  const modeValues = getCheckboxValues(rawComponents, 'poll_mode');
  const settingsValues = getCheckboxValues(rawComponents, 'poll_settings');

  const mode = (modeValues[0] ?? 'single') as 'single' | 'multi';
  const anonymous = settingsValues.includes('anonymous');
  const showLive = settingsValues.includes('show_live');

  // Validate options
  const options = parseOptions(optionsRaw);
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
    options,
  });

  let content = 'Poll updated! do Vote and Submit again to see the changes.';
  if (votesCleared) {
    content += ' Some votes were cleared due to removed options or voting mode change.';
  }

  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
