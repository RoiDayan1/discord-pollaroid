/**
 * Rank voting handlers — supports two modes:
 * - Star: Modal with SelectMenus per option (1-5 stars each, max 4 options)
 * - Order: Multi-step select menu flow, pick options from best to worst
 *
 * Creator flow (both modes):
 * 1. Creator clicks Rate/Submit → ephemeral with Rate|Rank / Edit / Close buttons
 * 2. Rate/Rank opens the vote modal/flow, Edit opens edit modal, Close closes rank
 *
 * The creator session stores the original button interaction so the rank
 * message can be refreshed after actions taken from the ephemeral.
 */

import {
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
  type APIModalInteractionResponseCallbackData,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  MessageFlags,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import {
  parseRankRate,
  parseRankRateGo,
  parseRankOrderStart,
  parseRankOrderStep,
  parseRankOrderGo,
  parseRankOrderClose,
  rankRateGoId,
  rankEditOpenId,
  rankCloseId,
  rankOrderStepId,
  rankOrderGoId,
  rankOrderCloseId,
  RANK_STAR_VOTE_MODAL_PREFIX,
  modalRankStarId,
} from '../util/ids.js';
import type { Rank, RankOption } from '../db/ranks.js';
import {
  getRank,
  getRankOptions,
  getRankVotes,
  getUserRankVotes,
  voteRankStar,
  voteRankOrder,
  closeRank,
} from '../db/ranks.js';
import { buildMessageContent, buildRankEmbed } from '../util/embeds.js';
import { buildRankRateComponents, buildRankOrderComponents } from '../util/components.js';
import { getRawModalComponents, getCheckboxValues } from '../util/modal.js';

// ---------------------------------------------------------------------------
// Creator session map (star mode)
// ---------------------------------------------------------------------------

/** In-memory creator sessions for star mode — keyed by "rankId:userId". */
export const rankCreatorSessions = new Map<
  string,
  {
    rankId: string;
    /** The original button interaction on the rank message, used to refresh the embed. */
    rankInteraction: ButtonInteraction;
  }
>();

// ---------------------------------------------------------------------------
// Star rating — helpers
// ---------------------------------------------------------------------------

/** Builds the star vote modal payload for a given rank and user. */
function buildStarVoteModal(
  rankId: string,
  options: RankOption[],
  currentRatings: Map<number, number>,
): APIModalInteractionResponseCallbackData {
  const components = options.map((opt, i) => ({
    type: ComponentType.Label as const,
    label: `Rate: ${opt.label}`.slice(0, 45),
    component: {
      type: ComponentType.StringSelect as const,
      custom_id: modalRankStarId(i),
      placeholder: 'Choose a rating',
      required: false,
      min_values: 0,
      max_values: 1,
      options: [1, 2, 3, 4, 5].map((s) => ({
        label: '\u2B50'.repeat(s),
        value: String(s),
        default: currentRatings.get(opt.idx) === s,
      })),
    },
  }));

  return {
    title: 'Rate',
    custom_id: `${RANK_STAR_VOTE_MODAL_PREFIX}${rankId}`,
    components,
  };
}

// ---------------------------------------------------------------------------
// Star rating — modal open
// ---------------------------------------------------------------------------

/** Handles the "Rate" button on the rank message. */
export async function handleRankStarVoteOpen(interaction: ButtonInteraction) {
  const parsed = parseRankRate(interaction.customId);
  if (!parsed) return;

  const { rankId } = parsed;
  const rank = getRank(rankId);
  if (!rank || rank.closed) {
    await interaction.reply({ content: 'This ranking is closed.', flags: MessageFlags.Ephemeral });
    return;
  }

  // Creator: show ephemeral with Rate / Edit / Close buttons
  if (interaction.user.id === rank.creator_id) {
    await interaction.deferUpdate();
    const key = sessionKey(rankId, interaction.user.id);
    rankCreatorSessions.set(key, { rankId, rankInteraction: interaction });

    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(rankRateGoId(rankId))
        .setLabel('Rate')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(rankEditOpenId(rankId))
        .setLabel('Edit Ranking')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(rankCloseId(rankId))
        .setLabel('Close Ranking')
        .setStyle(ButtonStyle.Danger),
    );

    await interaction.followUp({
      content: 'What would you like to do?',
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Non-creator: open star vote modal directly
  const options = getRankOptions(rankId);
  const userVotes = getUserRankVotes(rankId, interaction.user.id);
  const currentRatings = new Map(userVotes.map((v) => [v.option_idx, v.value]));
  await interaction.showModal(buildStarVoteModal(rankId, options, currentRatings));
}

/** Creator clicked "Rate" on the ephemeral — opens the star vote modal. */
export async function handleRankRateGo(interaction: ButtonInteraction) {
  const parsed = parseRankRateGo(interaction.customId);
  if (!parsed) return;

  const { rankId } = parsed;
  const rank = getRank(rankId);
  if (!rank || rank.closed) {
    await interaction.reply({ content: 'This ranking is closed.', flags: MessageFlags.Ephemeral });
    return;
  }

  const options = getRankOptions(rankId);
  const userVotes = getUserRankVotes(rankId, interaction.user.id);
  const currentRatings = new Map(userVotes.map((v) => [v.option_idx, v.value]));
  await interaction.showModal(buildStarVoteModal(rankId, options, currentRatings));
}

// ---------------------------------------------------------------------------
// Star rating — modal submit
// ---------------------------------------------------------------------------

/** Records star ratings from the modal and refreshes the rank message. */
export async function handleRankStarVoteSubmit(interaction: ModalSubmitInteraction) {
  const rankId = interaction.customId.slice(RANK_STAR_VOTE_MODAL_PREFIX.length);
  const rank = getRank(rankId);
  if (!rank || rank.closed) {
    await interaction.reply({ content: 'This ranking is closed.', flags: MessageFlags.Ephemeral });
    return;
  }

  const options = getRankOptions(rankId);
  const rawComponents = getRawModalComponents(interaction);
  recordStarRatings(rank, options, rawComponents, interaction.user.id);

  // Build confirmation summary
  const rated = options
    .map((opt, i) => {
      const val = getCheckboxValues(rawComponents, modalRankStarId(i))[0];
      return val ? `**${opt.label}**: ${'⭐'.repeat(parseInt(val, 10))}` : null;
    })
    .filter(Boolean);
  const summary =
    rated.length > 0 ? `Ratings recorded!\n${rated.join('\n')}` : 'No ratings submitted.';

  // Check for creator session (modal was opened from the ephemeral)
  const key = sessionKey(rankId, interaction.user.id);
  const session = rankCreatorSessions.get(key);

  if (session?.rankInteraction) {
    // Creator path: refresh rank message via stored interaction
    const votes = getRankVotes(rankId);
    const embed = buildRankEmbed(rank, options, votes, !!rank.show_live);
    const components = buildRankRateComponents(rankId);
    try {
      await session.rankInteraction.editReply({
        ...buildMessageContent(rank.title, rank.mentions),
        embeds: [embed],
        components,
      });
    } catch {
      // Token may have expired — embed will refresh on next interaction
    }

    await interaction.reply({ content: summary, flags: MessageFlags.Ephemeral });
  } else {
    // Non-creator path: refresh via deferUpdate + editReply
    await refreshRankMessage(interaction, rank, options, rankId);

    if (!rank.show_live) {
      await interaction.followUp({ content: summary, flags: MessageFlags.Ephemeral });
    }
  }
}

/** Records star ratings from SelectMenu values. */
function recordStarRatings(
  rank: Rank,
  options: RankOption[],
  rawComponents: ReturnType<typeof getRawModalComponents>,
  userId: string,
): void {
  for (let i = 0; i < options.length; i++) {
    const val = getCheckboxValues(rawComponents, modalRankStarId(i))[0];
    if (val) {
      voteRankStar(rank.id, options[i].idx, userId, parseInt(val, 10));
    }
  }
}

/** Rebuilds the rank embed and updates the rank message in-place. */
async function refreshRankMessage(
  interaction: ModalSubmitInteraction,
  rank: Rank,
  options: RankOption[],
  rankId: string,
): Promise<void> {
  const votes = getRankVotes(rankId);
  const embed = buildRankEmbed(rank, options, votes, !!rank.show_live);
  const components = buildRankRateComponents(rankId);
  await interaction.deferUpdate();
  await interaction.editReply({
    ...buildMessageContent(rank.title, rank.mentions),
    embeds: [embed],
    components,
  });
}

// ---------------------------------------------------------------------------
// Ordering flow
// ---------------------------------------------------------------------------

/** In-memory ordering sessions — keyed by "rankId:userId". */
const orderingSessions = new Map<
  string,
  {
    rankId: string;
    picks: { optionIdx: number; position: number }[];
    /** The original button interaction on the rank message, used to refresh the embed. */
    rankInteraction?: ButtonInteraction;
  }
>();

function sessionKey(rankId: string, userId: string): string {
  return `${rankId}:${userId}`;
}

/** Starts the ordering flow — shows the first step select menu (or creator choice). */
export async function handleRankOrderStart(interaction: ButtonInteraction) {
  const parsed = parseRankOrderStart(interaction.customId);
  if (!parsed) return;

  const { rankId } = parsed;
  const rank = getRank(rankId);
  if (!rank || rank.closed) {
    await interaction.reply({ content: 'This ranking is closed.', flags: MessageFlags.Ephemeral });
    return;
  }

  const options = getRankOptions(rankId);
  const key = sessionKey(rankId, interaction.user.id);

  // Defer the button on the rank message so we can editReply later to refresh the embed
  await interaction.deferUpdate();

  // Store the interaction so we can refresh the rank message after the flow completes
  orderingSessions.set(key, { rankId, picks: [], rankInteraction: interaction });

  // Creator sees "Rank" + "Edit" + "Close" buttons; others go straight to the select menu flow
  if (interaction.user.id === rank.creator_id) {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(rankOrderGoId(rankId))
        .setLabel('Rank')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(rankEditOpenId(rankId))
        .setLabel('Edit Ranking')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(rankOrderCloseId(rankId))
        .setLabel('Close Ranking')
        .setStyle(ButtonStyle.Danger),
    );

    await interaction.followUp({
      content: 'What would you like to do?',
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(rankOrderStepId(rankId, 1))
    .setPlaceholder('Select your #1 (best) choice')
    .addOptions(options.map((opt) => ({ label: opt.label, value: String(opt.idx) })));

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select);

  await interaction.followUp({
    content: `**Rank the options from best to worst** (step 1/${options.length})`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

/** Handles each step of the ordering flow — records pick, shows next step or saves. */
export async function handleRankOrderStep(interaction: StringSelectMenuInteraction) {
  const parsed = parseRankOrderStep(interaction.customId);
  if (!parsed) return;

  const { rankId, position } = parsed;
  const rank = getRank(rankId);
  if (!rank || rank.closed) {
    await interaction.update({ content: 'This ranking is closed.', components: [] });
    return;
  }

  const options = getRankOptions(rankId);
  const key = sessionKey(rankId, interaction.user.id);

  // Get or create session (reset picks if starting from position 1, keep rankInteraction)
  let session = orderingSessions.get(key);
  if (!session || position === 1) {
    session = { rankId, picks: [], rankInteraction: session?.rankInteraction };
    orderingSessions.set(key, session);
  }

  // Record this pick
  const selectedIdx = parseInt(interaction.values[0], 10);
  session.picks.push({ optionIdx: selectedIdx, position });

  const nextPosition = position + 1;
  const remaining = options.filter((opt) => !session!.picks.some((p) => p.optionIdx === opt.idx));

  // Auto-assign the last remaining option and save
  if (remaining.length === 1) {
    session.picks.push({ optionIdx: remaining[0].idx, position: nextPosition });
    voteRankOrder(rankId, interaction.user.id, session.picks);

    const summary = session.picks
      .sort((a, b) => a.position - b.position)
      .map((p) => {
        const label = options.find((o) => o.idx === p.optionIdx)?.label;
        return `**${p.position}.** ${label}`;
      })
      .join('\n');

    await interaction.update({
      content: `Ranking submitted!\n\n${summary}`,
      components: [],
    });

    // Refresh the rank message embed via the stored button interaction
    if (session.rankInteraction) {
      try {
        const votes = getRankVotes(rankId);
        const embed = buildRankEmbed(rank, options, votes, !!rank.show_live);
        const components = buildRankOrderComponents(rankId);
        await session.rankInteraction.editReply({
          ...buildMessageContent(rank.title, rank.mentions),
          embeds: [embed],
          components,
        });
      } catch {
        // Token may have expired — embed will refresh on next interaction
      }
    }

    orderingSessions.delete(key);
    return;
  }

  // Show next step
  const select = new StringSelectMenuBuilder()
    .setCustomId(rankOrderStepId(rankId, nextPosition))
    .setPlaceholder(`Select your #${nextPosition} choice`)
    .addOptions(remaining.map((opt) => ({ label: opt.label, value: String(opt.idx) })));

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select);

  await interaction.update({
    content: `**Rank the options from best to worst** (step ${nextPosition}/${options.length})`,
    components: [row],
  });
}

// ---------------------------------------------------------------------------
// Creator ephemeral — "Rank" button (starts ordering flow)
// ---------------------------------------------------------------------------

/** Creator clicked "Rank" on the ephemeral — starts the select menu flow. */
export async function handleRankOrderGo(interaction: ButtonInteraction) {
  const parsed = parseRankOrderGo(interaction.customId);
  if (!parsed) return;

  const { rankId } = parsed;
  const rank = getRank(rankId);
  if (!rank || rank.closed) {
    await interaction.update({ content: 'This ranking is closed.', components: [] });
    return;
  }

  const options = getRankOptions(rankId);
  const key = sessionKey(rankId, interaction.user.id);

  // Reset picks but keep the stored rankInteraction
  const session = orderingSessions.get(key);
  if (session) session.picks = [];

  const select = new StringSelectMenuBuilder()
    .setCustomId(rankOrderStepId(rankId, 1))
    .setPlaceholder('Select your #1 (best) choice')
    .addOptions(options.map((opt) => ({ label: opt.label, value: String(opt.idx) })));

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select);

  await interaction.update({
    content: `**Rank the options from best to worst** (step 1/${options.length})`,
    components: [row],
  });
}

// ---------------------------------------------------------------------------
// Creator ephemeral — "Close" button
// ---------------------------------------------------------------------------

/** Creator clicked "Close Ranking" on the ephemeral — closes and refreshes embed. */
export async function handleRankOrderClose(interaction: ButtonInteraction) {
  const parsed = parseRankOrderClose(interaction.customId);
  if (!parsed) return;

  const { rankId } = parsed;
  const rank = getRank(rankId);
  if (!rank) return;

  if (rank.closed) {
    await interaction.update({ content: 'This ranking is already closed.', components: [] });
    return;
  }

  if (interaction.user.id !== rank.creator_id) {
    await interaction.update({
      content: 'Only the creator can close this ranking.',
      components: [],
    });
    return;
  }

  closeRank(rankId);

  await interaction.update({ content: 'Ranking closed!', components: [] });

  // Refresh the rank message embed via the stored button interaction
  const key = sessionKey(rankId, interaction.user.id);
  const session = orderingSessions.get(key);
  if (session?.rankInteraction) {
    try {
      const options = getRankOptions(rankId);
      const votes = getRankVotes(rankId);
      const updatedRank = getRank(rankId)!;
      const embed = buildRankEmbed(updatedRank, options, votes, true);
      await session.rankInteraction.editReply({
        ...buildMessageContent(updatedRank.title, updatedRank.mentions),
        embeds: [embed],
        components: [],
      });
    } catch {
      // Token may have expired — embed will refresh on next interaction
    }
  }

  orderingSessions.delete(key);
}
