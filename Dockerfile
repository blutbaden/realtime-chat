# ── Stage 1: build TypeScript ──────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY server/ ./server/
RUN npm run build

# ── Stage 2: production image ───────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install wget (needed for HEALTHCHECK) and runtime dependencies
RUN apk add --no-cache wget
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled server
COPY --from=builder /app/dist ./dist

# Copy static assets
COPY public/ ./public/

EXPOSE 4000

# Drop to non-root user for security
USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
