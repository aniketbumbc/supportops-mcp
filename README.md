# Enterprise SupportOps MCP

An AI support assistant for customer support and finance teams. Staff ask questions in plain language, and the assistant looks up customers, invoices and tickets, opens and updates tickets, and prepares refunds. **Money only moves when a person confirms it.**

The same capabilities are exposed as an [MCP](https://modelcontextprotocol.io) server, so tools like Cursor and Claude Code can use them directly with a personal access token.

**Live:** [enterprisesupportmcp.com](https://enterprisesupportmcp.com)

---

## Features

- **Chat assistant**: ask "Acme was charged twice this month, refund the duplicate" and get answers as rich cards (customer, invoices, tickets, refund preview), not just text.
- **Human-confirmed refunds**: the assistant only *prepares* a refund. The user reviews a preview and confirms it. Nothing is refunded automatically.
- **Approval workflow**: refunds above a role's direct limit go to an approval queue, where a lead or finance user approves or rejects them.
- **Role-based access**: each role sees only the tools it's allowed to use, with its own refund limits. Checks run on the server, not just in the UI.
- **Audit log**: every tool call is recorded with who did it, what they asked and the result. Admins can browse it in the app.
- **Personal access tokens**: users create tokens to connect Cursor or Claude Code to the MCP server. Tokens act with the user's role.
- **Safe retries**: refunds use idempotency keys, so a retried request never refunds twice.

## Architecture

```
 Browser ──► Next.js app (client/) ──► MCP server + API (server/) ──► Mock CRM, billing, ticketing
                 │  chat agent (OpenAI)        │  auth, roles, audit,
                 │                             │  approvals, idempotency
 Cursor / ───────┴──── MCP over HTTP ─────────►│
 Claude Code                                    ├──► Postgres (Neon)
                                                └──► Redis (Upstash)
```

| Part | What it does |
|---|---|
| `client/` | Next.js web app: login, chat, approvals, access tokens, audit log. Runs the chat agent and calls the MCP server's tools. |
| `server/` | Fastify MCP server and API. Checks the caller's token and role, runs the tool, writes the audit log, and handles login, approvals and tokens. |
| `server/src/crm-system/` | Mock CRM, billing and ticketing APIs standing in for real business systems. |

## Tech stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, Vercel AI SDK, OpenAI
- **Backend:** Node.js 22, Fastify 5, MCP TypeScript SDK, Drizzle ORM, Zod
- **Data:** PostgreSQL, Redis
- **Auth:** JWT (RS256) with argon2 password hashing
- **Deploy:** Docker Compose behind Caddy

## Roles

| Role | Can do | Direct refund limit | Refund limit with approval |
|---|---|---|---|
| Support agent | Read everything, create and update tickets, update customers | None | None |
| Support lead | Everything, approve refunds | ₹10,000 | ₹25,000 |
| Finance | Read everything, issue and approve refunds | ₹1,00,000 | ₹5,00,000 |
| Admin | Everything, plus the audit log | ₹1,00,000 | ₹5,00,000 |

## MCP tools

| Tool | Purpose |
|---|---|
| `find_customer` | Search customers by name, email or reference |
| `get_customer_account` | Customer profile, contacts and subscription |
| `get_customer_invoices` | Invoices with payments, refunds and refund eligibility |
| `search_customer_tickets` | A customer's support tickets |
| `create_customer` | Create a customer |
| `update_customer` | Update customer details |
| `create_support_ticket` | Open a ticket |
| `update_ticket` | Change a ticket's status, priority or assignee, or add an internal note |
| `issue_refund` | Preview a refund, then execute it once confirmed (or send it for approval) |

## Running locally

### Prerequisites

- Node.js 22+ and pnpm 10
- A Postgres database (e.g. a free [Neon](https://neon.tech) project)
- A Redis instance (e.g. a free [Upstash](https://upstash.com) database)
- An OpenAI API key

### 1. Server

```bash
cd server
pnpm install
```

Create `server/.env`:

```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
AUTH_MODE=jwt
JWT_ISSUER=enterprise-crm-mcp-dev
JWT_AUDIENCE=enterprise-crm-mcp
JWT_JWKS_FILE=.keys/jwks.json
JWT_PRIVATE_KEY_FILE=.keys/private.jwk.json
MOCK_SYSTEMS_PORT=4100
MOCK_SYSTEMS_BASE_URL=http://localhost:4100
MOCK_SYSTEMS_API_KEY=<any random string, 8+ characters>
SEED_USER_PASSWORD=<password for the demo users>
```

Then set up the signing keys and database:

```bash
pnpm dev:token --user setup --roles admin   # creates the key pair in .keys/ (never commit it)
pnpm check:connections                      # Postgres and Redis should report OK
pnpm db:generate && pnpm db:migrate         # create the tables
pnpm db:seed                                # demo customers, invoices, tickets and users
```

Start the mock systems and the server, each in its own terminal:

```bash
pnpm dev:mock   # mock CRM on :4100
pnpm dev        # MCP server + API on :4000
```

### 2. Client

```bash
cd client
pnpm install
```

Create `client/.env`:

```env
MCP_SERVER_URL=http://localhost:4000
OPENAI_API_KEY=sk-...
OPENAI_MODEL=<an OpenAI chat model>
```

```bash
pnpm dev   # http://localhost:3000
```

### Demo users

All demo users log in with the password from `SEED_USER_PASSWORD`. In development, the login page lists them as one-click shortcuts.

| Email | Role |
|---|---|
| `agent@crm.example` | Support agent |
| `lead@crm.example` | Support lead |
| `finance@crm.example` | Finance |
| `admin@crm.example` | Admin |

## Connecting Cursor or Claude Code

1. Log in and open **Access tokens**.
2. Create a token. It's shown once, so copy it.
3. Copy the ready-made config for Cursor or the command for Claude Code from the same page.

The token acts with your role, so the tools you see match what you can do in the app.

## Project structure

```
client/
  src/app/            pages: login, chat, approvals, tokens, audit; /api/chat route
  src/components/     chat UI, result cards, approvals, tokens, app shell
  src/lib/agent/      chat agent: system prompt and MCP tool wiring
  src/lib/api/        typed calls to the server API
server/
  src/transport/      MCP endpoint and HTTP routes (auth, approvals, audit)
  src/gateway/        token checks, request context, signing keys
  src/policy/         roles, tool permissions, refund limits
  src/tools/          one file per MCP tool
  src/services/       business rules
  src/adapters/       connectors to the CRM, billing and ticketing systems
  src/audit/          audit log writer
  src/db/             Drizzle schema, migrations and seed data
  src/crm-system/     mock business systems
  scripts/            connection check and key/token generator
docker-compose.yml
```

## Author

Developed by [Aniket B Dev](https://www.aniketbdev.com/).
