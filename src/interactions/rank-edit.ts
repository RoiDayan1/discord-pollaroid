/**
 * Rank edit flow — allows the rank creator to modify a live ranking.
 *
 * Flow: Creator clicks Rate/Submit → ephemeral with Edit button →
 * pre-filled edit modal → submit → DB updated, message refreshed.
 */

import {
  type APIModalInteractionResponseCallbackComponent,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  ComponentType,
  TextInputStyle,
  MessageFlags,
} from 'discord.js';
import { getRank, getRankOptions, getRankVotes, updateRank } from '../db/ranks.js';
import {
  parseRankEditOpen,
  RANK_EDIT_MODAL_PREFIX,
  MODAL_RANK_TITLE,
  MODAL_RANK_OPTIONS,
  MODAL_RANK_MODE,
  MODAL_RANK_SETTINGS,
} from '../util/ids.js';
import { getRawModalComponents, getCheckboxValues } from '../util/modal.js';
import { parseOptions, validateRankOptions } from '../util/validation.js';
import { buildRankEmbed } from '../util/embeds.js';
import { buildRankRateComponents, buildRankOrderComponents } from '../util/components.js';
import { rankCreatorSessions } from './rank-vote.js';

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
      description: 'One option per line (minimum 2)',
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
        max_values: 2,
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
        ],
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

  const modeValues = getCheckboxValues(rawComponents, MODAL_RANK_MODE);
  const settingsValues = getCheckboxValues(rawComponents, MODAL_RANK_SETTINGS);

  const mode = (modeValues[0] ?? 'star') as 'star' | 'order';
  const anonymous = settingsValues.includes('anonymous');
  const showLive = settingsValues.includes('show_live');

  const options = parseOptions(optionsRaw);
  const error = validateRankOptions(options);
  if (error) {
    await interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
    return;
  }

  const votesCleared = updateRank(rankId, {
    title,
    mode,
    anonymous: anonymous ? 1 : 0,
    show_live: showLive ? 1 : 0,
    options,
  });

  let content = 'Ranking updated!';
  if (votesCleared) {
    content += ' All votes were cleared due to option or mode changes.';
  }

  await interaction.reply({ content, flags: MessageFlags.Ephemeral });

  // Refresh the rank message via the stored creator session
  const key = `${rankId}:${interaction.user.id}`;
  const session = rankCreatorSessions.get(key);
  const storedInteraction = session?.rankInteraction;

  if (storedInteraction) {
    try {
      const updatedRank = getRank(rankId)!;
      const updatedOptions = getRankOptions(rankId);
      const votes = getRankVotes(rankId);
      const embed = buildRankEmbed(updatedRank, updatedOptions, votes, !!updatedRank.show_live);
      const components =
        updatedRank.mode === 'star'
          ? buildRankRateComponents(rankId)
          : buildRankOrderComponents(rankId);
      await storedInteraction.editReply({ embeds: [embed], components });
    } catch {
      // Token may have expired — embed will refresh on next interaction
    }
  }
}
