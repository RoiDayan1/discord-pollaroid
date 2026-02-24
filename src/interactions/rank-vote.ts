/**
 * Rank voting handlers — supports two modes:
 * - Star: Modal with SelectMenus per option (1-5 stars each, max 4 options)
 * - Order: Multi-step select menu flow, pick options from best to worst
 *
 * The ordering flow uses an in-memory session map (lost on restart).
 */

import {
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
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
  parseRankOrderStart,
  parseRankOrderStep,
  parseRankOrderGo,
  parseRankOrderClose,
  rankOrderStepId,
  rankOrderGoId,
  rankOrderCloseId,
  RANK_STAR_VOTE_MODAL_PREFIX,
  MODAL_RANK_CLOSE,
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
import { buildRankEmbed } from '../util/embeds.js';
import { buildRankRateComponents, buildRankOrderComponents } from '../util/components.js';
import { getRawModalComponents, getCheckboxValues } from '../util/modal.js';

// ---------------------------------------------------------------------------
// Star rating — modal open
// ---------------------------------------------------------------------------

/** Opens the star rating modal when the "Rate" button is clicked. */
export async function handleRankStarVoteOpen(interaction: ButtonInteraction) {
  const parsed = parseRankRate(interaction.customId);
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

  // One StringSelect per option — pre-select the user's current rating
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const components: any[] = options.map((opt, i) => ({
    type: ComponentType.Label,
    label: `Rate: ${opt.label}`.slice(0, 45),
    component: {
      type: ComponentType.StringSelect,
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

  // Creator-only close option (only if room — max 5 components)
  if (interaction.user.id === rank.creator_id && components.length < 5) {
    components.push({
      type: ComponentType.Label,
      label: 'Creator Options',
      component: {
        type: ComponentType.CheckboxGroup,
        custom_id: MODAL_RANK_CLOSE,
        min_values: 0,
        max_values: 1,
        required: false,
        options: [{ label: 'Close this ranking', value: 'close', default: false }],
      },
    });
  }

  const modalPayload = {
    title: 'Rate',
    custom_id: `${RANK_STAR_VOTE_MODAL_PREFIX}${rankId}`,
    components,
  };

  await interaction.showModal(modalPayload);
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
  const creatorAction = getCheckboxValues(rawComponents, MODAL_RANK_CLOSE)[0];

  // --- Branch: Creator chose "Close" ---
  if (creatorAction === 'close' && interaction.user.id === rank.creator_id) {
    // Record any ratings before closing
    recordStarRatings(rank, options, rawComponents, interaction.user.id);
    closeRank(rankId);
    const updatedRank = getRank(rankId)!;
    const votes = getRankVotes(rankId);
    const embed = buildRankEmbed(updatedRank, options, votes, true);

    await interaction.deferUpdate();
    await interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  // --- Branch: Regular rating ---
  recordStarRatings(rank, options, rawComponents, interaction.user.id);
  await refreshRankMessage(interaction, rank, options, rankId);

  // Ephemeral confirmation when results aren't live
  if (!rank.show_live) {
    const rated = options
      .map((opt, i) => {
        const val = getCheckboxValues(rawComponents, modalRankStarId(i))[0];
        return val ? `**${opt.label}**: ${'⭐'.repeat(parseInt(val, 10))}` : null;
      })
      .filter(Boolean);

    const message =
      rated.length > 0 ? `Ratings recorded!\n${rated.join('\n')}` : 'No ratings submitted.';
    await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
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
  await interaction.editReply({ embeds: [embed], components });
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

  // Creator sees "Rank" + "Close" buttons; others go straight to the select menu flow
  if (interaction.user.id === rank.creator_id) {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(rankOrderGoId(rankId))
        .setLabel('Rank')
        .setStyle(ButtonStyle.Primary),
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
        await session.rankInteraction.editReply({ embeds: [embed], components });
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
      await session.rankInteraction.editReply({ embeds: [embed], components: [] });
    } catch {
      // Token may have expired — embed will refresh on next interaction
    }
  }

  orderingSessions.delete(key);
}
