# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Security: run as non-root
RUN addgroup -S mediflow && adduser -S mediflow -G mediflow

# Copy only production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Remove dev/sensitive files that slipped past .dockerignore
RUN rm -f .env .env.* 2>/dev/null; true

# Set ownership
RUN chown -R mediflow:mediflow /app
USER mediflow

EXPOSE 5000

# Health check — matches the /health endpoint in app.js
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "server.js"]
