import { nanoid } from 'nanoid';

export function generateId(): string {
  return nanoid(8);
}

// Poll customId helpers
export function pollVoteOpenId(pollId: string): string {
  return `poll:${pollId}:vote-open`;
}

export function pollCloseId(pollId: string): string {
  return `poll:${pollId}:close`;
}

export function parsePollVoteOpen(customId: string): { pollId: string } | null {
  const match = customId.match(/^poll:(\w+):vote-open$/);
  if (!match) return null;
  return { pollId: match[1] };
}

export function pollEditOpenId(pollId: string): string {
  return `poll:${pollId}:edit-open`;
}

export function parsePollEditOpen(customId: string): { pollId: string } | null {
  const match = customId.match(/^poll:(\w+):edit-open$/);
  if (!match) return null;
  return { pollId: match[1] };
}

export function parsePollClose(customId: string): { pollId: string } | null {
  const match = customId.match(/^poll:(\w+):close$/);
  if (!match) return null;
  return { pollId: match[1] };
}

// Rank customId helpers
export function rankStarButtonId(rankId: string, optionIdx: number, stars: number): string {
  return `rank:${rankId}:star:${optionIdx}:${stars}`;
}

export function rankCloseId(rankId: string): string {
  return `rank:${rankId}:close`;
}

export function rankOrderStartId(rankId: string): string {
  return `rank:${rankId}:order-start`;
}

export function rankOrderStepId(rankId: string, position: number): string {
  return `rank:${rankId}:order-step:${position}`;
}

export function parseRankStar(
  customId: string,
): { rankId: string; optionIdx: number; stars: number } | null {
  const match = customId.match(/^rank:(\w+):star:(\d+):(\d+)$/);
  if (!match) return null;
  return { rankId: match[1], optionIdx: parseInt(match[2], 10), stars: parseInt(match[3], 10) };
}

export function parseRankClose(customId: string): { rankId: string } | null {
  const match = customId.match(/^rank:(\w+):close$/);
  if (!match) return null;
  return { rankId: match[1] };
}

export function parseRankOrderStart(customId: string): { rankId: string } | null {
  const match = customId.match(/^rank:(\w+):order-start$/);
  if (!match) return null;
  return { rankId: match[1] };
}

export function parseRankOrderStep(customId: string): { rankId: string; position: number } | null {
  const match = customId.match(/^rank:(\w+):order-step:(\d+)$/);
  if (!match) return null;
  return { rankId: match[1], position: parseInt(match[2], 10) };
}
