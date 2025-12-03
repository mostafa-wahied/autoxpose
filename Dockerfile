FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

RUN pnpm install --frozen-lockfile

COPY packages/backend ./packages/backend
COPY packages/frontend ./packages/frontend
RUN pnpm --filter backend build
RUN pnpm --filter frontend build

FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 autoxpose

COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=builder /app/packages/frontend/dist ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/backend/node_modules ./packages/backend/node_modules

RUN mkdir -p /app/packages/backend/data && chown autoxpose:nodejs /app/packages/backend/data

USER autoxpose

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

WORKDIR /app/packages/backend
CMD ["node", "dist/index.js"]
