# syntax=docker/dockerfile:1

# ---- build stage: compile TypeScript with full (dev) deps ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage: prod deps + compiled output only (no tsx/test tooling) ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
# Seed Redis once after the stack is up (reads the active sale from Supabase).
# The prod image has no tsx, so run the compiled script directly:
#   docker compose exec backend node dist/scripts/seedRedis.js
CMD ["node", "dist/index.js"]
