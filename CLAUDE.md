# Pollaroid

Discord bot for polls and rankings. TypeScript, discord.js v14, SQLite.

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
    poll.ts             # /poll (opens creation modal directly)
    rank.ts             # /rank create (slash options)

  interactions/         # Button/select menu/modal handlers
    index.ts            # Routes by customId regex matching
    poll-vote.ts        # Poll voting (button opens modal with CheckboxGroup)
    poll-close.ts       # Close poll (creator only)
    rank-vote.ts        # Star rating + ordering flow
    rank-close.ts       # Close rank (creator only)

  db/                   # SQLite via better-sqlite3 (synchronous)
    connection.ts       # DB instance (WAL mode, foreign keys ON)
    schema.ts           # CREATE TABLE statements (idempotent)
    polls.ts            # Poll CRUD + vote operations
    ranks.ts            # Rank CRUD + vote operations

  util/
    ids.ts              # nanoid generation + customId encode/decode
    embeds.ts           # Poll/rank result embed builders
    components.ts       # ActionRow/button/select menu builders
    constants.ts        # Colors, labels, limits
```

## Architecture

### Commands
- Implement `{ data: SharedSlashCommand, execute: (interaction) => Promise<void> }`
- Registered in `commands/index.ts` as a Map looked up by name
- `/poll` opens a modal with Label, TextInput, and CheckboxGroup components (no subcommand)
- `/rank create` uses slash command options directly

### Interaction Routing
- `interactions/index.ts` routes by customId regex pattern
- Pattern format: `<type>:<nanoid>:<action>:<params>`
- Examples: `poll:a8Kx3nQ1:vote:3`, `rank:b7Yz2mP4:star:0:5`, `poll:a8Kx3nQ1:close`

### Database
- SQLite file: `pollaroid.db` (project root)
- 6 tables: polls, poll_options, poll_votes, ranks, rank_options, rank_votes
- IDs are 8-char nanoids (not Discord snowflakes) to fit customId limit
- All vote operations use transactions
- `message_id` is nullable (set after bot sends the message)

### Modal Components (New Discord API)
- Label (type 18), RadioGroup (type 21), CheckboxGroup (type 22), Checkbox (type 23)
- No discord.js builder classes yet — use raw API payloads with `@ts-expect-error`
- Modal submit data: Labels wrap components, access via `interaction.components` array
- discord.js transforms `custom_id` → `customId` (camelCase) on modal submit data
- CheckboxGroup submit: `{ values: string[] }` — used for both single and multi choice
- Single choice uses CheckboxGroup with `max_values: 1` (not RadioGroup)
- `findModalComponent()` in poll.ts: searches by `customId` (camelCase, not snake_case)

### Poll Voting Flow
- Vote button opens a modal with CheckboxGroup (both single and multi choice modes)
- Previous votes are pre-selected via `default: true` on options
- Live results update uses `interaction.deferUpdate()` + `interaction.editReply()` (interaction webhook, no channel permissions needed)
- Non-live polls reply with ephemeral confirmation message

## Key Constraints

| Discord Limit              | Value | Impact                                    |
|----------------------------|-------|-------------------------------------------|
| ActionRows per message     | 5     | Max 20 poll options (4x5 buttons + close) |
| Buttons per ActionRow      | 5     | Star rank: max 4 options/message + close  |
| Select menu options        | 25    | Our max is 20                             |
| customId length            | 100   | 8-char nanoid keeps IDs short             |
| Modal top-level components | 5     | Poll modal uses 4                         |
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
