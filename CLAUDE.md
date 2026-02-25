# PollaRoiD

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
    rank-vote.ts        # Rank voting (creator ephemeral flow + direct modal/flow for others)
    rank-close.ts       # Close rank (creator only, from star mode ephemeral)
    rank-edit.ts        # Edit rank (creator only, pre-filled modal)

  db/                   # SQLite via better-sqlite3 (synchronous)
    connection.ts       # DB instance (WAL mode, foreign keys ON)
    schema.ts           # CREATE TABLE statements (idempotent) + migrations
    polls.ts            # Poll CRUD + vote operations
    ranks.ts            # Rank CRUD + vote operations

  util/
    ids.ts              # nanoid generation + customId builders + regex patterns
    embeds.ts           # Poll/rank result embed builders + buildMessageContent()
    components.ts       # ActionRow/button builders for poll/rank messages
    constants.ts        # Enums (PollMode, RankMode, Setting), EVERYONE_SENTINEL, colors, star display, target icons
    modal.ts            # Modal data extraction (getRawModalComponents, getCheckboxValues)
    errors.ts           # safeErrorReply helper
    validation.ts       # parseOptions, parseOptionsWithTargets, validatePollOptions, validateRankOptions
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

### Enums & Constants (`util/constants.ts`)
- `PollMode`: `Single = 'single'`, `Multi = 'multi'`
- `RankMode`: `Star = 'star'`, `Order = 'order'`
- `Setting`: `Anonymous = 'anonymous'`, `ShowLive = 'show_live'`, `MentionEveryone = 'mention_everyone'`
- `EVERYONE_SENTINEL = 'everyone'` — sentinel value in the mentions JSON array for @everyone
- `TARGET_EMPTY = '○'`, `TARGET_PARTIAL = '◐'`, `TARGET_FILLED = '●'` — icons for option vote targets
- `targetIcon(target, count)` — returns the appropriate icon or `''` if no target
- Always use these enums instead of raw string literals for modes and settings

### Database
- SQLite file: `pollaroid.db` (project root)
- 6 tables: polls, poll_options, poll_votes, ranks, rank_options, rank_votes
- IDs are 8-char nanoids (not Discord snowflakes) to fit customId limit
- All vote operations use transactions
- `message_id` is nullable (set after bot sends the message)
- `poll_options` has optional `target` column (nullable integer) for per-option vote targets
- `poll_votes` keyed by `option_label` (not option_idx); `rank_votes` keyed by `option_idx`
- `mentions` column (JSON array of role ID strings, default `'[]'`) on both polls and ranks — used for optional role pings in message content
- Startup migrations handle schema evolution (e.g., adding `show_live` to ranks, poll_votes option_label migration, `mentions` to polls/ranks, `target` to poll_options)

### Modal Components (New Discord API)
- Label (type 18), CheckboxGroup (type 22), Checkbox (type 23), StringSelect (type 3), RoleSelect (type 6)
- No discord.js builder classes yet — use raw API payloads with `@ts-expect-error`
- `util/modal.ts` provides helpers: `getRawModalComponents()`, `findModalComponent()`, `getCheckboxValues()`, `getRoleSelectValues()`
- discord.js transforms `custom_id` → `customId` (camelCase) on modal submit data
- CheckboxGroup submit: `{ values: string[] }` — used for both single and multi choice
- Single choice uses CheckboxGroup with `max_values: 1` (not RadioGroup)

### Role Mentions
- Both creation and edit modals include an optional RoleSelect (type 6) as the 5th component
- Modal component IDs: `MODAL_POLL_MENTIONS`, `MODAL_RANK_MENTIONS`
- Stored as JSON array in `mentions` column (e.g., `'["everyone","123456789"]'`)
- `"everyone"` is a sentinel value in the array — not a real role ID
- `@everyone` support: "Mention @everyone" checkbox in the Settings CheckboxGroup (since Discord's RoleSelect doesn't include @everyone)
- `buildMessageContent(title, mentions)` in `util/embeds.ts` returns `{ content, allowedMentions }`:
  - Parses the mentions JSON, separates `"everyone"` sentinel from real role IDs
  - Formats `@everyone` and `<@&roleId>` mentions before the title
  - 0 mentions → `title`
  - 1 mention → `@everyone title` or `<@&id> title` (inline)
  - 2+ mentions → `@everyone <@&id1> ...\ntitle` (title on new line)
  - `allowedMentions.roles` contains real role IDs; `allowedMentions.parse` includes `'everyone'` when needed
  - Spread the return value into reply/editReply: `{ ...buildMessageContent(title, mentions), embeds, components }`
- Edit modals pre-fill RoleSelect with `default_values` (filtering out `"everyone"` sentinel) and pre-check the @everyone checkbox
- Changing mentions does NOT clear votes

### Poll Option Targets
- Each poll option can optionally have a vote target (e.g., 5)
- Input syntax: append ` /N` to an option line (e.g., `Valorant /5`); parsed by `parseOptionsWithTargets()`
- `ParsedOption` interface: `{ label: string; target: number | null }`
- Stored in `poll_options.target` column (nullable integer)
- Embed display: icon appears inline before the progress bar; progress bar ratio = `count/target`; vote count shown as `N/T votes`
- Icons: `○` (empty, 0 votes), `◐` (partial, some votes), `●` (filled, target reached)
- Filled options are excluded from the voting CheckboxGroup (unless user already voted for them)
- Server-side enforcement rejects new votes for filled options (race condition protection)
- Editing targets without changing labels preserves existing votes

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
- **Non-creator**: Rate button opens a modal with one StringSelect per option (1-5 stars) directly
- **Creator**: Rate button → `deferUpdate` + ephemeral with Rate/Edit/Close buttons → chosen action
  - Rate: opens the same StringSelect modal
  - Edit: opens pre-filled edit modal (title, options, mode, settings); `updateRank()` clears ALL votes if options/mode changed
  - Close: closes the ranking
- Previous ratings are pre-selected via `default: true` on StringSelect options
- Creator sessions stored in `rankCreatorSessions` Map (`rankId:userId` → interaction reference)

### Rank Ordering Flow
- Step-by-step ephemeral flow using StringSelectMenu
- Session map (`orderingSessions`) stores picks as user progresses (`rankId:userId` → interaction + picks)
- Creator gets ephemeral with Rank/Edit/Close buttons; non-creator goes straight to step 1
- Last option auto-assigned when only one remains
- Results update via stored `rankInteraction.editReply()` on the original message

## Key Constraints

| Discord Limit              | Value | Impact                                    |
|----------------------------|-------|-------------------------------------------|
| ActionRows per message     | 5     | Vote/Rate uses single button row          |
| Buttons per ActionRow      | 5     | —                                         |
| customId length            | 100   | 8-char nanoid keeps IDs short             |
| Modal top-level components | 5     | Both creation modals use all 5 slots      |
| Interaction response time  | 3s    | SQLite is fast, but defer if needed       |
| Min poll options           | 1     | Single option polls are allowed            |
| Min rank options (star)    | 1     | Single option star rankings are allowed    |
| Min rank options (order)   | 2     | Ordering requires at least 2 options       |

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
