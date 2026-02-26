/**
 * Rank edit flow — allows the rank creator to modify a live ranking.
 *
 * Flow: Creator clicks Rate/Submit → ephemeral with Edit button →
 * pre-filled edit modal → submit → DB updated, message refreshed.
 *
 * The rank message is refreshed via channel-based editing using the
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
import { getRank, getRankOptions, getRankVotes, updateRank } from '../db/ranks.js';
import { buildRankOrderComponents, buildRankRateComponents } from '../util/components.js';
import { EVERYONE_SENTINEL, RankMode, Setting } from '../util/constants.js';
import { buildMessageContent, buildRankEmbed } from '../util/embeds.js';
import {
  MODAL_RANK_MENTIONS,
  MODAL_RANK_MODE,
  MODAL_RANK_OPTIONS,
  MODAL_RANK_SETTINGS,
  MODAL_RANK_TITLE,
  parseRankEditOpen,
  RANK_EDIT_MODAL_PREFIX,
} from '../util/ids.js';
import { getCheckboxValues, getRawModalComponents, getRoleSelectValues } from '../util/modal.js';
import { parseOptions, validateRankOptions } from '../util/validation.js';
import { editChannelMessage } from '../util/messages.js';

/** Handles the "Edit Ranking" button click — shows a pre-filled edit modal. */
export async function handleRankEditButton(interaction: ButtonInteraction) {
  const parsed = parseRankEditOpen(interaction.customId);
  if (!parsed) return;

  const { rankId } = parsed;
  const rank = getRank(rankId);

  if (!rank || rank.closed) {
    await interaction.reply({
      content: 'This ranking is closed.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.user.id !== rank.creator_id) {
    await interaction.reply({
      content: 'Only the ranking creator can edit.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const options = getRankOptions(rankId);
  const optionText = options.map((o) => o.label).join('\n');
  const currentMentions: string[] = JSON.parse(rank.mentions);
  const hasEveryone = currentMentions.includes(EVERYONE_SENTINEL);
  const roleOnlyMentions = currentMentions.filter((id) => id !== EVERYONE_SENTINEL);

  const components: APIModalInteractionResponseCallbackComponent[] = [
    {
      type: ComponentType.Label,
      label: 'Ranking Title',
      component: {
        type: ComponentType.TextInput,
        custom_id: MODAL_RANK_TITLE,
        style: TextInputStyle.Short,
        value: rank.title,
        required: true,
      },
    },
    {
      type: ComponentType.Label,
      label: 'Options',
      description: 'One option per line (minimum 1; order mode requires 2)',
      component: {
        type: ComponentType.TextInput,
        custom_id: MODAL_RANK_OPTIONS,
        style: TextInputStyle.Paragraph,
        value: optionText,
        required: true,
      },
    },
    {
      type: ComponentType.Label,
      label: 'Ranking Mode',
      component: {
        type: ComponentType.CheckboxGroup,
        custom_id: MODAL_RANK_MODE,
        min_values: 1,
        max_values: 1,
        options: [
          { label: 'Star Rating', value: 'star', default: rank.mode === 'star' },
          { label: 'Ordering', value: 'order', default: rank.mode === 'order' },
        ],
      },
    },
    {
      type: ComponentType.Label,
      label: 'Settings',
      component: {
        type: ComponentType.CheckboxGroup,
        custom_id: MODAL_RANK_SETTINGS,
        min_values: 0,
        max_values: 3,
        required: false,
        options: [
          {
            label: 'Anonymous',
            value: 'anonymous',
            description: 'Hide voter names',
            default: !!rank.anonymous,
          },
          {
            label: 'Show Live Results',
            value: 'show_live',
            description: 'Show results before closing',
            default: !!rank.show_live,
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
        custom_id: MODAL_RANK_MENTIONS,
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
    title: 'Edit Ranking',
    custom_id: `${RANK_EDIT_MODAL_PREFIX}${rankId}`,
    components,
  };

  await interaction.showModal(modalPayload);
}

/** Handles the edit modal submission — validates, updates DB, refreshes message. */
export async function handleRankEditModalSubmit(interaction: ModalSubmitInteraction) {
  const rankId = interaction.customId.slice(RANK_EDIT_MODAL_PREFIX.length);
  const rank = getRank(rankId);

  if (!rank || rank.closed) {
    await interaction.reply({
      content: 'This ranking is closed.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.user.id !== rank.creator_id) {
    await interaction.reply({
      content: 'Only the ranking creator can edit.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const title = interaction.fields.getTextInputValue(MODAL_RANK_TITLE);
  const optionsRaw = interaction.fields.getTextInputValue(MODAL_RANK_OPTIONS);
  const rawComponents = getRawModalComponents(interaction);

  const modeValues = getCheckboxValues(rawComponents, MODAL_RANK_MODE) as RankMode[];
  const settingsValues = getCheckboxValues(rawComponents, MODAL_RANK_SETTINGS) as Setting[];

  const mode = modeValues[0] ?? RankMode.Star;
  const anonymous = settingsValues.includes(Setting.Anonymous);
  const showLive = settingsValues.includes(Setting.ShowLive);
  const mentionRoleIds: string[] = getRoleSelectValues(rawComponents, MODAL_RANK_MENTIONS);
  if (settingsValues.includes(Setting.MentionEveryone)) mentionRoleIds.unshift(EVERYONE_SENTINEL);
  const mentions = JSON.stringify(mentionRoleIds);

  const options = parseOptions(optionsRaw);
  const error = validateRankOptions(options, mode);
  if (error) {
    await interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
    return;
  }

  const votesCleared = updateRank(rankId, {
    title,
    mode,
    anonymous: anonymous ? 1 : 0,
    show_live: showLive ? 1 : 0,
    mentions,
    options,
  });

  let content = 'Ranking updated!';
  if (votesCleared) {
    content += ' All votes were cleared due to option or mode changes.';
  }

  await interaction.reply({ content, flags: MessageFlags.Ephemeral });

  // Refresh the rank message via channel editing
  const updatedRank = getRank(rankId)!;
  const updatedOptions = getRankOptions(rankId);
  const votes = getRankVotes(rankId);
  const embed = buildRankEmbed(updatedRank, updatedOptions, votes, !!updatedRank.show_live);
  const components =
    updatedRank.mode === RankMode.Star
      ? buildRankRateComponents(rankId)
      : buildRankOrderComponents(rankId);

  await editChannelMessage(interaction, updatedRank.channel_id, updatedRank.message_id, {
    ...buildMessageContent(updatedRank.title, updatedRank.mentions),
    embeds: [embed],
    components,
  });
}
