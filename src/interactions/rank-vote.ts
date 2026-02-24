/**
 * Rank voting handlers — supports two modes:
 * - Star: Click a star button (1-5) per option, each click replaces your rating
 * - Order: Multi-step select menu flow, pick options from best to worst
 *
 * The ordering flow uses an in-memory session map (lost on restart).
 */

import {
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  MessageFlags,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { parseRankStar, parseRankOrderStart, parseRankOrderStep } from '../util/ids.js';
import { rankOrderStepId } from '../util/ids.js';
import { getRank, getRankOptions, voteRankStar, voteRankOrder } from '../db/ranks.js';

// ---------------------------------------------------------------------------
// Star rating
// ---------------------------------------------------------------------------

/** Records a star rating for a single option. */
export async function handleRankStarVote(interaction: ButtonInteraction) {
  const parsed = parseRankStar(interaction.customId);
  if (!parsed) return;

  const { rankId, optionIdx, stars } = parsed;
  const rank = getRank(rankId);
  if (!rank || rank.closed) {
    await interaction.reply({ content: 'This ranking is closed.', flags: MessageFlags.Ephemeral });
    return;
  }

  voteRankStar(rankId, optionIdx, interaction.user.id, stars);

  const options = getRankOptions(rankId);
  const optionLabel = options.find((o) => o.idx === optionIdx)?.label ?? `Option ${optionIdx}`;

  await interaction.reply({
    content: `You rated **${optionLabel}** ${'⭐'.repeat(stars)}`,
    flags: MessageFlags.Ephemeral,
  });
}

// ---------------------------------------------------------------------------
// Ordering flow
// ---------------------------------------------------------------------------

/** In-memory ordering sessions — keyed by "rankId:userId". */
const orderingSessions = new Map<
  string,
  { rankId: string; picks: { optionIdx: number; position: number }[] }
>();

function sessionKey(rankId: string, userId: string): string {
  return `${rankId}:${userId}`;
}

/** Starts the ordering flow — shows the first step select menu. */
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

  const select = new StringSelectMenuBuilder()
    .setCustomId(rankOrderStepId(rankId, 1))
    .setPlaceholder('Select your #1 (best) choice')
    .addOptions(options.map((opt) => ({ label: opt.label, value: String(opt.idx) })));

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select);

  await interaction.reply({
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

  // Get or create session (reset if starting from position 1)
  let session = orderingSessions.get(key);
  if (!session || position === 1) {
    session = { rankId, picks: [] };
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
    orderingSessions.delete(key);

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
