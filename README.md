# PollaRoiD

A Discord bot for creating polls and rankings with live results, anonymous voting, role mentions, and more. Built with TypeScript, discord.js v14, and Knex.js (SQLite + PostgreSQL).

[Invite PollaRoiD to your server](https://discord.com/oauth2/authorize?client_id=1475195199897600092&scope=bot+applications.commands&permissions=2147535872)

## Features

### Polls (`/poll create`)

- **Single or multi-choice** voting modes
- **Live results** — optionally update the embed in real time as votes come in
- **Anonymous voting** — hide who voted for what
- **Vote targets** — set a goal for each option (e.g., `Valorant /5`) with progress indicators
- **Role mentions** — ping specific roles or `@everyone` when the poll is posted
- **Edit & close** — the poll creator can edit options/settings or close the poll at any time

### Rankings (`/rank create`)

- **Star mode** — rate each option 1-5 stars via dropdown selects
- **Order mode** — rank options step-by-step from most to least preferred
- **Live results** and **anonymous voting**, same as polls
- **Edit & close** — the ranking creator can modify or close the ranking

### General

- Voting UI uses Discord's native modals and components (checkboxes, dropdowns)
- Previous votes are pre-selected so users can update their choices
- Filled vote targets are automatically excluded from the voting form
- Embeds show a visual progress bar for each option
- Supports both SQLite (local dev) and PostgreSQL (production) — no external services required for local use

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Yarn](https://yarnpkg.com/) (or npm)
- A [Discord application](https://discord.com/developers/applications) with a bot token

### Create a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** and give it a name
3. Go to **Bot** and click **Reset Token** — copy the token
4. Go to **OAuth2 > URL Generator**, select the `bot` and `applications.commands` scopes
5. Under **Bot Permissions**, select at minimum: Send Messages, Embed Links, Use Slash Commands
6. Open the generated URL to invite the bot to your server

### Install & Run

```bash
# Clone the repository
git clone https://github.com/your-username/discord-pollaroid.git
cd discord-pollaroid

# Install dependencies
yarn install

# Configure environment
cp .env.example .env
# Edit .env and fill in your values:
#   BOT_TOKEN      — your bot token from the Developer Portal
#   CLIENT_ID      — your application's Client ID (from General Information)
#   GUILD_ID       — your Discord server ID (right-click server → Copy Server ID)
#   DATABASE_URL   — (optional) PostgreSQL connection string; omit for local SQLite

# Register slash commands with Discord
yarn deploy-commands

# Start the bot
yarn dev
```

Without `DATABASE_URL`, the bot creates a `pollaroid.db` SQLite file in the project root. With `DATABASE_URL` set to a PostgreSQL connection string, it uses PostgreSQL instead.

## Usage

### Creating a Poll

1. Type `/poll create` in any channel
2. Fill in the modal:
   - **Title** — the question or topic
   - **Options** — one per line (min 1)
   - **Mode** — single choice or multi-choice
   - **Settings** — anonymous voting, live results, mention @everyone
   - **Mention Roles** — optionally select roles to ping
3. The bot posts an embed with a **Vote** button

**Vote targets:** Append `/N` to any option to set a target number of votes:
```
Pizza /5
Burgers /3
Tacos
```
Options that reach their target show a filled indicator and are excluded from future votes.

### Creating a Ranking

1. Type `/rank create` in any channel
2. Fill in the modal:
   - **Title** — what's being ranked
   - **Options** — one per line (min 1 for star mode, min 2 for order mode)
   - **Mode** — star rating (1-5) or ordering (rank from best to worst)
   - **Settings** — anonymous voting, live results, mention @everyone
   - **Mention Roles** — optionally select roles to ping
3. The bot posts an embed with a **Rate** or **Rank** button

### Managing Polls & Rankings

The creator of a poll or ranking gets extra controls when clicking the vote/rate button:

- **Vote / Rate / Rank** — cast your own vote
- **Edit** — change the title, options, mode, or settings (changing options or mode clears all votes)
- **Close** — close voting and finalize results

## Development

### Scripts

```bash
yarn dev               # Start with hot reload (tsx watch)
yarn build             # Compile TypeScript to dist/
yarn start             # Run compiled JS from dist/
yarn deploy-commands   # Register slash commands with Discord
yarn validate          # Typecheck + lint + format check
yarn format            # Auto-fix formatting with Prettier
```

### Project Structure

```
src/
  index.ts              # Entry point, event routing
  config.ts             # Environment config
  deploy-commands.ts    # Slash command registration script

  commands/             # Slash command definitions
    poll.ts             # /poll create
    rank.ts             # /rank create

  interactions/         # Button, modal, and select menu handlers
    poll-vote.ts        # Poll voting flow
    poll-close.ts       # Close poll
    poll-edit.ts        # Edit poll
    rank-vote.ts        # Rank voting flow
    rank-close.ts       # Close ranking
    rank-edit.ts        # Edit ranking

  db/                   # Knex.js database layer (SQLite or PostgreSQL)
    connection.ts       # Knex instance factory + initDb()
    schema.ts           # Schema creation + migrations (idempotent)
    polls.ts            # Poll CRUD + vote operations (async)
    ranks.ts            # Rank CRUD + vote operations (async)

  util/                 # Shared utilities
    ids.ts              # ID generation + customId patterns
    embeds.ts           # Embed builders
    components.ts       # Button/action row builders
    constants.ts        # Enums, colors, display constants
    modal.ts            # Modal data extraction helpers
    messages.ts         # Bot message editing via REST API
    errors.ts           # Error reply helper
    validation.ts       # Option parsing + validation
```

### Tech Stack

- **Runtime:** Node.js with ESM
- **Language:** TypeScript (strict mode, ES2022 target)
- **Discord library:** discord.js v14
- **Database:** Knex.js — SQLite (via better-sqlite3) for local dev, PostgreSQL (via pg) for production
- **Linting:** ESLint + typescript-eslint
- **Formatting:** Prettier (single quotes, trailing commas, 100 char width)

### Architecture Notes

- Interaction routing uses customId regex matching — IDs follow the pattern `<type>:<nanoid>:<action>`
- 8-character nanoid IDs keep customIds well within Discord's 100-char limit
- All vote operations use database transactions for consistency
- All DB functions are async — Knex abstracts dialect differences between SQLite and PostgreSQL
- Modal components use raw API payloads since discord.js doesn't have builder classes for newer component types (CheckboxGroup, Label, etc.) yet
- Schema migrations run automatically on startup

## Deployment

The bot can be deployed to any Node.js hosting platform. A [Render.com](https://render.com) blueprint (`render.yaml`) is included for one-click setup with a web service and PostgreSQL database.

To deploy manually:
1. Provision a PostgreSQL database
2. Set `DATABASE_URL` to the connection string
3. Run `yarn install && yarn build && yarn deploy-commands`
4. Start with `yarn start`

## License

MIT
