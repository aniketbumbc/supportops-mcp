# MCP server + API. The same image also runs the mock CRM (see docker-compose.yml).
FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# Dev dependencies are kept: `pnpm start` runs through tsx, and drizzle-kit runs migrations.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
EXPOSE 4000
CMD ["pnpm", "start"]
