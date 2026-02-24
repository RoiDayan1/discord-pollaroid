# Pollaroid

Discord bot for polls and rankings. TypeScript, discord.js v14, SQLite.

## Instructions

When planning changes that add, remove, or change functionality, include a final step to update this CLAUDE.md file to reflect those changes. Skip this for small fixes that don't affect documented behavior or structure.

## Quick Reference

```bash
yarn dev               # Start bot with hot reload
yarn build             # Compile TypeScript to dist/
yarn start             # Run compiled JS
yarn deploy-commands   # Register slash commands with Discord
yarn validate          # Run typecheck + lint + format check
yarn format            # Auto-fix formatting
```

## Project Structure

```
src/
  index.ts              # Entry point, event routing
  config.ts             # Env config (BOT_TOKEN, CLIENT_ID, GUILD_ID)
  deploy-commands.ts    # One-shot script to register slash commands

  commands/             # Slash command definitions + execute handlers
    index.ts            # Command registry (Map<string, Command>)
    poll.ts             # /poll create (opens creation modal)
    rank.ts             # /rank create (opens creation modal)

  interactions/         # Button/select menu/modal handlers
    index.ts            # Routes by customId regex matching
    poll-vote.ts        # Poll voting (creator ephemeral flow + direct modal for others)
    poll-close.ts       # Close poll (creator only)
    poll-edit.ts        # Edit poll (creator only, pre-filled modal)
    rank-vote.ts        # Star rating modal + ordering step-by-step flow
    rank-close.ts       # Close rank (star mode message button, currently unused)

  db/                   # SQLite via better-sqlite3 (synchronous)
    connection.ts       # DB instance (WAL mode, foreign keys ON)
    schema.ts           # CREATE TABLE statements (idempotent) + migrations
    polls.ts            # Poll CRUD + vote operations
    ranks.ts            # Rank CRUD + vote operations

  util/
    ids.ts              # nanoid generation + customId builders + regex patterns
    embeds.ts           # Poll/rank result embed builders
    components.ts       # ActionRow/button builders for poll/rank messages
    constants.ts        # Colors, labels, limits, star display
    modal.ts            # Modal data extraction (getRawModalComponents, getCheckboxValues)
    errors.ts           # safeErrorReply helper
    validation.ts       # parseOptions, validatePollOptions, validateRankOptions
```

## Architecture

### Commands
- Implement `{ data: SharedSlashCommand, execute: (interaction) => Promise<void> }`
- Registered in `commands/index.ts` as a Map looked up by name
- `/poll create` and `/rank create` both open creation modals directly

### Interaction Routing
- `interactions/index.ts` routes by customId regex pattern
- Pattern format: `<type>:<nanoid>:<action>[:<params>]`
- Examples: `poll:a8Kx3nQ1:vote-open`, `rank:b7Yz2mP4:rate`, `rank:b7Yz2mP4:order-step:1`

### Database
- SQLite file: `pollaroid.db` (project root)
- 6 tables: polls, poll_options, poll_votes, ranks, rank_options, rank_votes
- IDs are 8-char nanoids (not Discord snowflakes) to fit customId limit
- All vote operations use transactions
- `message_id` is nullable (set after bot sends the message)
- `poll_votes` keyed by `option_label` (not option_idx); `rank_votes` keyed by `option_idx`
- Startup migrations handle schema evolution (e.g., adding `show_live` to ranks, poll_votes option_label migration)

### Modal Components (New Discord API)
- Label (type 18), CheckboxGroup (type 22), Checkbox (type 23), StringSelect (type 3)
- No discord.js builder classes yet — use raw API payloads with `@ts-expect-error`
- `util/modal.ts` provides helpers: `getRawModalComponents()`, `findModalComponent()`, `getCheckboxValues()`
- discord.js transforms `custom_id` → `customId` (camelCase) on modal submit data
- CheckboxGroup submit: `{ values: string[] }` — used for both single and multi choice
- Single choice uses CheckboxGroup with `max_values: 1` (not RadioGroup)

### Poll Voting Flow
- **Non-creator**: Vote button opens a modal with CheckboxGroup directly
- **Creator**: Vote button → `deferUpdate` + ephemeral with Vote/Edit/Close buttons → chosen action
  - Vote: opens the same CheckboxGroup modal
  - Edit: opens pre-filled edit modal (title, options, mode, settings); `updatePoll()` clears votes if options/mode changed
  - Close: closes the poll
- Previous votes are pre-selected via `default: true` on CheckboxGroup options
- Creator sessions stored in module-scope Map (`pollId:userId` → interaction reference)
- Live results update uses `interaction.deferUpdate()` + `interaction.editReply()` (interaction webhook, no channel permissions needed)
- Non-live polls reply with ephemeral confirmation message

### Rank Star Voting Flow
- Rate button opens a modal with one StringSelect per option (1-5 stars), pre-selected to existing ratings
- If creator and room in modal (< 5 components), adds a "Close this ranking" CheckboxGroup inside the modal
- Creator can close directly from the star vote modal submit

### Rank Ordering Flow
- Step-by-step ephemeral flow using StringSelectMenu
- Session map stores picks as user progresses (`rankId:userId` → interaction + picks)
- Creator gets ephemeral with Rank/Close buttons; non-creator goes straight to step 1
- Last option auto-assigned when only one remains
- Results update via stored `rankInteraction.editReply()` on the original message

## Key Constraints

| Discord Limit              | Value | Impact                                    |
|----------------------------|-------|-------------------------------------------|
| ActionRows per message     | 5     | Max 20 poll options (4x5 buttons + close) |
| Buttons per ActionRow      | 5     | Star rank: max 4 options in modal         |
| customId length            | 100   | 8-char nanoid keeps IDs short             |
| Modal top-level components | 5     | Poll creation modal uses 4                |
| Interaction response time  | 3s    | SQLite is fast, but defer if needed       |

## Environment

Requires `.env` file (see `.env.example`):
```
BOT_TOKEN=...
CLIENT_ID=...
GUILD_ID=...
```

## Code Style

- Prettier: single quotes, trailing commas, 100 char width, semicolons
- ESLint: recommended + typescript-eslint, unused args with `_` prefix allowed
- ESM only (`"type": "module"` in package.json)
- Target: ES2022, strict mode

## Discord Developer Docs

- Components overview: https://docs.discord.com/developers/components/overview
- Component reference (all types): https://docs.discord.com/developers/components/reference
- Using modal components: https://docs.discord.com/developers/components/using-modal-components
- Using message components: https://docs.discord.com/developers/components/using-message-components
- Getting started: https://docs.discord.com/developers/intro
- Full docs index (for LLMs): https://docs.discord.com/llms.txt
