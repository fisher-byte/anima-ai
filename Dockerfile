# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source
COPY src/ ./src/
COPY vite.config.ts tsconfig.json tsconfig.server.json ./
COPY tailwind.config.js postcss.config.js ./
COPY env.d.ts ./

# Build frontend
RUN npm run build:client

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy server source
COPY src/server/ ./src/server/
COPY src/shared/ ./src/shared/
COPY tsconfig.server.json ./

# Copy built frontend from builder stage
COPY --from=builder /app/dist ./dist

# Data volume for SQLite persistence
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000

CMD ["npx", "tsx", "src/server/index.ts"]
