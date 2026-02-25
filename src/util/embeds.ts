import { EmbedBuilder } from 'discord.js';
import type { Poll, PollOption, PollVote } from '../db/polls.js';
import type { Rank, RankOption, RankVote } from '../db/ranks.js';
import {
  BAR_EMPTY,
  BAR_FILLED,
  BAR_LENGTH,
  BAR_PREFIX,
  COLORS,
  EMPTY_SPACE,
  EVERYONE_SENTINEL,
  PollMode,
  RankMode,
  starsDisplay,
} from './constants.js';

/**
 * Builds the message content string with optional role mentions before the title,
 * plus `allowedMentions` so Discord actually pings the roles.
 * - 0 mentions: just the title
 * - 1 mention: `@everyone Title` or `<@&roleId> Title` (inline)
 * - 2+ mentions: `@everyone <@&id1> ...\nTitle` (title on new line)
 *
 * If the title starts with a markdown header (`#`), mentions are always
 * placed on a separate line so Discord renders the heading correctly.
 *
 * The mentions JSON may contain `"everyone"` as a sentinel for @everyone.
 *
 * Spread the return value into your reply/editReply call:
 *   `await interaction.reply({ ...buildMessageContent(title, mentions), embeds, components })`
 */
export function buildMessageContent(
  title: string,
  mentions: string,
): { content: string; allowedMentions: { roles: string[]; parse?: 'everyone'[] } } {
  const all: string[] = JSON.parse(mentions);
  const hasEveryone = all.includes(EVERYONE_SENTINEL);
  const roleIds = all.filter((id) => id !== EVERYONE_SENTINEL);

  const parts: string[] = [];
  if (hasEveryone) parts.push('@everyone');
  parts.push(...roleIds.map((id) => `<@&${id}>`));

  let content: string;
  if (parts.length === 0) {
    content = title;
  } else if (parts.length === 1 && !/^#+ /g.test(title)) {
    content = `${parts[0]} ${title}`;
  } else {
    content = `${parts.join(' ')}\n${title}`;
  }

  const allowedMentions: { roles: string[]; parse?: 'everyone'[] } = { roles: roleIds };
  if (hasEveryone) allowedMentions.parse = ['everyone'];

  return { content, allowedMentions };
}

/** Renders a visual progress bar from a 0–1 ratio, e.g. `╴▰▰▰▰▱▱▱▱▱▱` */
function progressBar(ratio: number): string {
  const filled = Math.round(ratio * BAR_LENGTH);
  const bar = BAR_FILLED.repeat(filled) + BAR_EMPTY.repeat(BAR_LENGTH - filled);
  return `${BAR_PREFIX}${bar}`;
}

/**
 * Builds the Discord embed for a poll.
 *
 * When `showResults` is true, each option displays a progress bar, vote count,
 * and (for public polls) up to 5 voter mentions. Otherwise just lists option labels.
 *
 * Footer shows: voter count | mode | anonymous/public | open/closed status.
 */
export function buildPollEmbed(
  poll: Poll,
  options: PollOption[],
  votes: PollVote[],
  showResults: boolean,
): EmbedBuilder {
  const totalVoters = new Set(votes.map((v) => v.user_id)).size;
  const embed = new EmbedBuilder().setColor(poll.closed ? COLORS.CLOSED : COLORS.POLL);

  if (showResults) {
    // Tally votes per option — keyed by label since poll_votes stores option_label
    const voteCounts = new Map<string, { count: number; users: string[] }>();
    for (const opt of options) {
      voteCounts.set(opt.label, { count: 0, users: [] });
    }
    for (const v of votes) {
      const entry = voteCounts.get(v.option_label);
      if (entry) {
        entry.count++;
        entry.users.push(v.user_id);
      }
    }

    // Build each option line: label, progress bar, vote count, and optional voter mentions
    const lines = options.map((opt) => {
      const entry = voteCounts.get(opt.label)!;
      const pct = totalVoters > 0 ? entry.count / totalVoters : 0;
      const bar = progressBar(pct);
      let line = `**${opt.label}**\n${bar}${EMPTY_SPACE}${EMPTY_SPACE}**${entry.count}** vote${entry.count !== 1 ? 's' : ''}`;
      // Public polls: show up to 5 voter mentions, with a "+N more" overflow
      if (!poll.anonymous && entry.users.length > 0) {
        const userMentions = entry.users
          .slice(0, 5)
          .map((id) => `<@${id}>`)
          .join(', ');
        const extra = entry.users.length > 5 ? ` +${entry.users.length - 5} more` : '';
        line += `\n${userMentions}${extra}`;
      }
      return line;
    });

    embed.setDescription(lines.join('\n\n'));
  } else {
    // Hidden results — just show option labels
    const lines = options.map((opt) => `**${opt.label}**`);
    embed.setDescription(lines.join('\n'));
  }

  // Footer: voter count | mode | visibility | status
  const modeLabel = poll.mode === PollMode.Single ? 'Single Choice' : 'Multiple Choice';
  const anonLabel = poll.anonymous ? 'Anonymous' : 'Public';
  const statusLabel = poll.closed ? 'Closed' : 'Open';
  const voterTxt = `voter${totalVoters !== 1 ? 's' : ''}`;
  let footerText = `${totalVoters} ${voterTxt} | ${modeLabel} | ${anonLabel} | ${statusLabel}`;
  if (!showResults && !poll.closed) {
    footerText += '\nResults will be revealed when closed';
  }
  embed.setFooter({ text: footerText });

  return embed;
}

/**
 * Builds the Discord embed for a ranking.
 *
 * Three display modes depending on `showResults` and `rank.mode`:
 * - **Star + results**: star emoji, average rating, rating count, and voter mentions
 * - **Order + results**: options sorted by average rank position (lowest = best)
 * - **No results**: instruction text + option labels
 *
 * Footer shows: voter count | mode | anonymous/public | open/closed status.
 */
export function buildRankEmbed(
  rank: Rank,
  options: RankOption[],
  votes: RankVote[],
  showResults: boolean,
): EmbedBuilder {
  const totalVoters = new Set(votes.map((v) => v.user_id)).size;
  const embed = new EmbedBuilder().setColor(rank.closed ? COLORS.CLOSED : COLORS.RANK);

  if (showResults && rank.mode === RankMode.Star) {
    // Aggregate star ratings per option — sum, count, and unique voters
    const stats = new Map<number, { sum: number; count: number; users: string[] }>();
    for (const opt of options) {
      stats.set(opt.idx, { sum: 0, count: 0, users: [] });
    }
    for (const v of votes) {
      const entry = stats.get(v.option_idx);
      if (entry) {
        entry.sum += v.value;
        entry.count++;
        if (!entry.users.includes(v.user_id)) entry.users.push(v.user_id);
      }
    }

    // Build each option line: label, star emoji, average, rating count, voter mentions
    const lines = options.map((opt) => {
      const entry = stats.get(opt.idx)!;
      const avg = entry.count > 0 ? entry.sum / entry.count : 0;
      const avgStr = entry.count > 0 ? avg.toFixed(1) : '—';
      const stars = entry.count > 0 ? starsDisplay(avg) : '';
      let line = `**${opt.label}**\n${stars} **${avgStr}** avg (${entry.count} rating${entry.count !== 1 ? 's' : ''})`;
      // Public ranks: show up to 5 voter mentions, with a "+N more" overflow
      if (!rank.anonymous && entry.users.length > 0) {
        const userMentions = entry.users
          .slice(0, 5)
          .map((id) => `<@${id}>`)
          .join(', ');
        const extra = entry.users.length > 5 ? ` +${entry.users.length - 5} more` : '';
        line += `\n${userMentions}${extra}`;
      }
      return line;
    });

    embed.setDescription(lines.join('\n\n'));
  } else if (showResults && rank.mode === RankMode.Order) {
    // Aggregate ordering positions per option — lower average = ranked higher
    const stats = new Map<number, { sum: number; count: number }>();
    for (const opt of options) {
      stats.set(opt.idx, { sum: 0, count: 0 });
    }
    for (const v of votes) {
      const entry = stats.get(v.option_idx);
      if (entry) {
        entry.sum += v.value;
        entry.count++;
      }
    }

    // Sort by average rank position ascending (best first), unvoted options sink to bottom
    const sorted = options
      .map((opt) => {
        const entry = stats.get(opt.idx)!;
        const avg = entry.count > 0 ? entry.sum / entry.count : Infinity;
        return { opt, avg, count: entry.count };
      })
      .sort((a, b) => a.avg - b.avg);

    const lines = sorted.map((item, i) => {
      const avgStr = item.count > 0 ? item.avg.toFixed(1) : '—';
      return `**${i + 1}. ${item.opt.label}**   — avg rank ${avgStr}`;
    });

    embed.setDescription(lines.join('\n'));
  } else {
    // Hidden results — show mode-specific instructions + option labels
    const lines = options.map((opt) => `**${opt.label}**`);
    const modeDesc =
      rank.mode === RankMode.Star
        ? 'Rate each option from 1-5 stars'
        : 'Rank options from best to worst';
    embed.setDescription(`${modeDesc}\n\n${lines.join('\n')}`);
  }

  // Footer: voter count | mode | visibility | status
  const modeLabel = rank.mode === RankMode.Star ? 'Star Rating' : 'Ordering';
  const anonLabel = rank.anonymous ? 'Anonymous' : 'Public';
  const statusLabel = rank.closed ? 'Closed' : 'Open';
  let rankFooter = `${totalVoters} voter${totalVoters !== 1 ? 's' : ''} | ${modeLabel} | ${anonLabel} | ${statusLabel}`;
  if (!showResults && !rank.closed) {
    rankFooter += '\nResults will be revealed when closed';
  }
  embed.setFooter({ text: rankFooter });

  return embed;
}
