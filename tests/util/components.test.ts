import { describe, it, expect } from 'vitest';
import { ButtonStyle } from 'discord.js';
import {
  buildPollComponents,
  buildRankRateComponents,
  buildRankOrderComponents,
} from '../../src/util/components.js';
import { pollVoteOpenId, rankRateId, rankOrderStartId } from '../../src/util/ids.js';

describe('buildPollComponents', () => {
  it('returns one action row', () => {
    const rows = buildPollComponents('test1');
    expect(rows).toHaveLength(1);
  });

  it('contains a Vote button with correct customId', () => {
    const rows = buildPollComponents('test1');
    const json = rows[0].toJSON();
    expect(json.components).toHaveLength(1);
    expect(json.components[0]).toMatchObject({
      custom_id: pollVoteOpenId('test1'),
      label: 'Vote',
      style: ButtonStyle.Primary,
    });
  });
});

describe('buildRankRateComponents', () => {
  it('returns one action row', () => {
    const rows = buildRankRateComponents('rank1');
    expect(rows).toHaveLength(1);
  });

  it('contains a Rate button with correct customId', () => {
    const rows = buildRankRateComponents('rank1');
    const json = rows[0].toJSON();
    expect(json.components[0]).toMatchObject({
      custom_id: rankRateId('rank1'),
      label: 'Rate',
      style: ButtonStyle.Primary,
    });
  });
});

describe('buildRankOrderComponents', () => {
  it('returns one action row', () => {
    const rows = buildRankOrderComponents('rank1');
    expect(rows).toHaveLength(1);
  });

  it('contains a Submit Your Ranking button', () => {
    const rows = buildRankOrderComponents('rank1');
    const json = rows[0].toJSON();
    expect(json.components[0]).toMatchObject({
      custom_id: rankOrderStartId('rank1'),
      label: 'Submit Your Ranking',
      style: ButtonStyle.Primary,
    });
  });
});
