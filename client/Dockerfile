# Next.js web app.
FROM node:22-slim AS build

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# src/env.ts validates on import, so the build needs placeholders.
# The real values come from client/.env when the container starts.
RUN OPENAI_API_KEY=build-placeholder OPENAI_MODEL=build-placeholder pnpm build

FROM node:22-slim
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["pnpm", "start"]
