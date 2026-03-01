import { describe, it, expect } from 'vitest';
import { buildMessageContent, buildPollEmbed, buildRankEmbed } from '../../src/util/embeds.js';
import {
  BAR_FILLED,
  COLORS,
  PollMode,
  RankMode,
  STAR_EMOJI,
  TARGET_EMPTY,
  TARGET_FILLED,
  TARGET_PARTIAL,
} from '../../src/util/constants.js';
import type { Poll, PollOption, PollVote } from '../../src/db/polls.js';
import type { Rank, RankOption, RankVote } from '../../src/db/ranks.js';

// --------------------------------------------------------------------------
// buildMessageContent
// --------------------------------------------------------------------------

describe('buildMessageContent', () => {
  it('returns title only when mentions is empty array', () => {
    const result = buildMessageContent('My Poll', '[]');
    expect(result.content).toBe('My Poll');
    expect(result.allowedMentions.roles).toEqual([]);
    expect(result.allowedMentions.parse).toBeUndefined();
  });

  it('prefixes @everyone when mentions contains sentinel', () => {
    const result = buildMessageContent('My Poll', '["everyone"]');
    expect(result.content).toBe('@everyone My Poll');
    expect(result.allowedMentions.parse).toEqual(['everyone']);
    expect(result.allowedMentions.roles).toEqual([]);
  });

  it('prefixes role mention inline for single role', () => {
    const result = buildMessageContent('Title', '["12345"]');
    expect(result.content).toBe('<@&12345> Title');
    expect(result.allowedMentions.roles).toEqual(['12345']);
  });

  it('puts mentions on separate line for 2+ mentions', () => {
    const result = buildMessageContent('Title', '["everyone","12345"]');
    expect(result.content).toBe('@everyone <@&12345>\nTitle');
    expect(result.allowedMentions.parse).toEqual(['everyone']);
    expect(result.allowedMentions.roles).toEqual(['12345']);
  });

  it('handles mixed everyone + multiple roles', () => {
    const result = buildMessageContent('Title', '["everyone","111","222"]');
    expect(result.content).toBe('@everyone <@&111> <@&222>\nTitle');
    expect(result.allowedMentions.roles).toEqual(['111', '222']);
  });

  it('puts single mention on separate line when title starts with #', () => {
    const result = buildMessageContent('# Heading', '["12345"]');
    expect(result.content).toBe('<@&12345>\n# Heading');
  });

  it('handles multiple roles without everyone', () => {
    const result = buildMessageContent('Title', '["111","222"]');
    expect(result.content).toBe('<@&111> <@&222>\nTitle');
    expect(result.allowedMentions.parse).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// buildPollEmbed helpers
// --------------------------------------------------------------------------

function makePoll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: 'test1',
    guild_id: 'g1',
    channel_id: 'c1',
    message_id: 'msg1',
    creator_id: 'creator1',
    title: 'Test Poll',
    mode: PollMode.Single,
    anonymous: 0,
    show_live: 1,
    mentions: '[]',
    closed: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeOpt(overrides: Partial<PollOption> = {}): PollOption {
  return { id: 1, poll_id: 'test1', idx: 0, label: 'Option A', target: null, ...overrides };
}

function makeVote(overrides: Partial<PollVote> = {}): PollVote {
  return {
    poll_id: 'test1',
    option_label: 'Option A',
    user_id: 'voter1',
    voted_at: new Date().toISOString(),
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// buildPollEmbed
// --------------------------------------------------------------------------

describe('buildPollEmbed', () => {
  it('uses COLORS.POLL for open polls', () => {
    const embed = buildPollEmbed(makePoll(), [makeOpt()], [], true);
    expect(embed.data.color).toBe(COLORS.POLL);
  });

  it('uses COLORS.CLOSED for closed polls', () => {
    const embed = buildPollEmbed(makePoll({ closed: 1 }), [makeOpt()], [], true);
    expect(embed.data.color).toBe(COLORS.CLOSED);
  });

  it('shows option labels without bars when showResults is false', () => {
    const embed = buildPollEmbed(makePoll(), [makeOpt()], [], false);
    expect(embed.data.description).toContain('**Option A**');
    expect(embed.data.description).not.toContain(BAR_FILLED);
  });

  it('shows "Results will be revealed when closed" for non-live open poll', () => {
    const embed = buildPollEmbed(makePoll(), [makeOpt()], [], false);
    expect(embed.data.footer?.text).toContain('Results will be revealed when closed');
  });

  it('does not show reveal message for closed polls', () => {
    const embed = buildPollEmbed(makePoll({ closed: 1 }), [makeOpt()], [], false);
    expect(embed.data.footer?.text).not.toContain('Results will be revealed');
  });

  it('shows progress bars and vote counts when showResults is true', () => {
    const votes = [makeVote()];
    const embed = buildPollEmbed(makePoll(), [makeOpt()], votes, true);
    expect(embed.data.description).toContain(BAR_FILLED);
    expect(embed.data.description).toContain('**1** vote');
  });

  it('counts voters correctly from votes array', () => {
    const votes = [
      makeVote({ user_id: 'u1' }),
      makeVote({ user_id: 'u2' }),
      makeVote({ user_id: 'u3' }),
    ];
    const embed = buildPollEmbed(makePoll(), [makeOpt()], votes, true);
    expect(embed.data.footer?.text).toMatch(/^3 voters/);
  });

  it('uses singular "voter" for 1 voter', () => {
    const embed = buildPollEmbed(makePoll(), [makeOpt()], [makeVote()], true);
    expect(embed.data.footer?.text).toMatch(/^1 voter\b/);
  });

  it('shows target vote counts as N/T format', () => {
    const options = [makeOpt({ target: 5 })];
    const votes = [makeVote(), makeVote({ user_id: 'u2' }), makeVote({ user_id: 'u3' })];
    const embed = buildPollEmbed(makePoll(), options, votes, true);
    expect(embed.data.description).toContain('**3/5** votes');
  });

  it('displays correct target icons', () => {
    const options = [
      makeOpt({ idx: 0, label: 'Zero', target: 5 }),
      makeOpt({ id: 2, idx: 1, label: 'Partial', target: 5 }),
      makeOpt({ id: 3, idx: 2, label: 'Full', target: 2 }),
    ];
    const votes = [
      makeVote({ option_label: 'Partial', user_id: 'u1' }),
      makeVote({ option_label: 'Full', user_id: 'u1' }),
      makeVote({ option_label: 'Full', user_id: 'u2' }),
    ];
    const embed = buildPollEmbed(makePoll(), options, votes, true);
    const desc = embed.data.description!;
    expect(desc).toContain(TARGET_EMPTY); // Zero has 0 votes
    expect(desc).toContain(TARGET_PARTIAL); // Partial has 1/5
    expect(desc).toContain(TARGET_FILLED); // Full has 2/2
  });

  it('shows voter mentions for public polls', () => {
    const votes = [makeVote({ user_id: 'u123' })];
    const embed = buildPollEmbed(makePoll({ anonymous: 0 }), [makeOpt()], votes, true);
    expect(embed.data.description).toContain('<@u123>');
  });

  it('hides voter mentions for anonymous polls', () => {
    const votes = [makeVote({ user_id: 'u123' })];
    const embed = buildPollEmbed(makePoll({ anonymous: 1 }), [makeOpt()], votes, true);
    expect(embed.data.description).not.toContain('<@u123>');
  });

  it('handles zero votes gracefully', () => {
    const embed = buildPollEmbed(makePoll(), [makeOpt()], [], true);
    expect(embed.data.description).toContain('**0** vote');
    expect(embed.data.footer?.text).toMatch(/^0 voters/);
  });

  it('shows correct footer for single choice open anonymous poll', () => {
    const embed = buildPollEmbed(
      makePoll({ mode: PollMode.Single, anonymous: 1 }),
      [makeOpt()],
      [],
      true,
    );
    expect(embed.data.footer?.text).toContain('Single Choice');
    expect(embed.data.footer?.text).toContain('Anonymous');
    expect(embed.data.footer?.text).toContain('Open');
  });

  it('shows correct footer for multi choice closed public poll', () => {
    const embed = buildPollEmbed(
      makePoll({ mode: PollMode.Multi, anonymous: 0, closed: 1 }),
      [makeOpt()],
      [],
      true,
    );
    expect(embed.data.footer?.text).toContain('Multiple Choice');
    expect(embed.data.footer?.text).toContain('Public');
    expect(embed.data.footer?.text).toContain('Closed');
  });

  it('shows target suffix in hidden results', () => {
    const embed = buildPollEmbed(makePoll(), [makeOpt({ target: 5 })], [], false);
    expect(embed.data.description).toContain('(target: 5)');
  });

  it('handles multiple options with different vote counts', () => {
    const options = [
      makeOpt({ idx: 0, label: 'A' }),
      makeOpt({ id: 2, idx: 1, label: 'B' }),
    ];
    const votes = [
      makeVote({ option_label: 'A', user_id: 'u1' }),
      makeVote({ option_label: 'A', user_id: 'u2' }),
      makeVote({ option_label: 'B', user_id: 'u3' }),
    ];
    const embed = buildPollEmbed(makePoll({ mode: PollMode.Multi }), options, votes, true);
    expect(embed.data.description).toContain('**A**');
    expect(embed.data.description).toContain('**B**');
  });
});

// --------------------------------------------------------------------------
// buildRankEmbed helpers
// --------------------------------------------------------------------------

function makeRank(overrides: Partial<Rank> = {}): Rank {
  return {
    id: 'rank1',
    guild_id: 'g1',
    channel_id: 'c1',
    message_id: 'msg1',
    creator_id: 'creator1',
    title: 'Test Rank',
    mode: RankMode.Star,
    anonymous: 0,
    show_live: 1,
    mentions: '[]',
    closed: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeRankOpt(overrides: Partial<RankOption> = {}): RankOption {
  return { id: 1, rank_id: 'rank1', idx: 0, label: 'Option A', ...overrides };
}

function makeRankVote(overrides: Partial<RankVote> = {}): RankVote {
  return {
    rank_id: 'rank1',
    option_idx: 0,
    user_id: 'voter1',
    value: 4,
    voted_at: new Date().toISOString(),
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// buildRankEmbed
// --------------------------------------------------------------------------

describe('buildRankEmbed', () => {
  it('uses COLORS.RANK for open ranks', () => {
    const embed = buildRankEmbed(makeRank(), [makeRankOpt()], [], true);
    expect(embed.data.color).toBe(COLORS.RANK);
  });

  it('uses COLORS.CLOSED for closed ranks', () => {
    const embed = buildRankEmbed(makeRank({ closed: 1 }), [makeRankOpt()], [], true);
    expect(embed.data.color).toBe(COLORS.CLOSED);
  });

  it('shows star ratings with averages for star mode + showResults', () => {
    const votes = [
      makeRankVote({ value: 4, user_id: 'u1' }),
      makeRankVote({ value: 2, user_id: 'u2' }),
    ];
    const embed = buildRankEmbed(makeRank(), [makeRankOpt()], votes, true);
    expect(embed.data.description).toContain(STAR_EMOJI);
    expect(embed.data.description).toContain('3.0');
    expect(embed.data.description).toContain('avg');
    expect(embed.data.description).toContain('2 ratings');
  });

  it('shows dash for avg when no votes in star mode', () => {
    const embed = buildRankEmbed(makeRank(), [makeRankOpt()], [], true);
    expect(embed.data.description).toContain('—');
    expect(embed.data.description).toContain('0 ratings');
  });

  it('shows sorted options by average rank for order mode', () => {
    const rank = makeRank({ mode: RankMode.Order });
    const options = [
      makeRankOpt({ idx: 0, label: 'Bad' }),
      makeRankOpt({ id: 2, idx: 1, label: 'Good' }),
    ];
    const votes = [
      makeRankVote({ option_idx: 0, value: 2, user_id: 'u1' }), // Bad: rank 2
      makeRankVote({ option_idx: 1, value: 1, user_id: 'u1' }), // Good: rank 1
    ];
    const embed = buildRankEmbed(rank, options, votes, true);
    const desc = embed.data.description!;
    const goodIdx = desc.indexOf('Good');
    const badIdx = desc.indexOf('Bad');
    expect(goodIdx).toBeLessThan(badIdx); // Good ranked first
  });

  it('shows instruction text when showResults is false for star mode', () => {
    const embed = buildRankEmbed(makeRank(), [makeRankOpt()], [], false);
    expect(embed.data.description).toContain('Rate each option from 1-5 stars');
  });

  it('shows instruction text when showResults is false for order mode', () => {
    const embed = buildRankEmbed(
      makeRank({ mode: RankMode.Order }),
      [makeRankOpt()],
      [],
      false,
    );
    expect(embed.data.description).toContain('Rank options from best to worst');
  });

  it('shows voter mentions for public star rankings', () => {
    const votes = [makeRankVote({ user_id: 'u999' })];
    const embed = buildRankEmbed(makeRank(), [makeRankOpt()], votes, true);
    expect(embed.data.description).toContain('<@u999>');
  });

  it('hides voter mentions for anonymous rankings', () => {
    const votes = [makeRankVote({ user_id: 'u999' })];
    const embed = buildRankEmbed(makeRank({ anonymous: 1 }), [makeRankOpt()], votes, true);
    expect(embed.data.description).not.toContain('<@u999>');
  });

  it('shows correct footer for star rating mode', () => {
    const embed = buildRankEmbed(makeRank(), [makeRankOpt()], [], true);
    expect(embed.data.footer?.text).toContain('Star Rating');
  });

  it('shows correct footer for ordering mode', () => {
    const embed = buildRankEmbed(
      makeRank({ mode: RankMode.Order }),
      [makeRankOpt()],
      [],
      true,
    );
    expect(embed.data.footer?.text).toContain('Ordering');
  });

  it('shows "Results will be revealed when closed" for hidden results on open rank', () => {
    const embed = buildRankEmbed(makeRank(), [makeRankOpt()], [], false);
    expect(embed.data.footer?.text).toContain('Results will be revealed when closed');
  });

  it('uses singular "rating" for 1 rating', () => {
    const votes = [makeRankVote()];
    const embed = buildRankEmbed(makeRank(), [makeRankOpt()], votes, true);
    expect(embed.data.description).toContain('1 rating');
    expect(embed.data.description).not.toContain('1 ratings');
  });

  it('handles order mode with no votes (shows — for avg)', () => {
    const embed = buildRankEmbed(
      makeRank({ mode: RankMode.Order }),
      [makeRankOpt(), makeRankOpt({ id: 2, idx: 1, label: 'B' })],
      [],
      true,
    );
    expect(embed.data.description).toContain('—');
  });
});
