# Taployal — all-in-one image (serves API + frontend on $PORT)
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App code + static assets
COPY server ./server
COPY public ./public

# The JSON database is seeded on first boot. For persistence across restarts,
# mount a volume at /data and set TAPLOYAL_DATA_DIR=/data.
RUN mkdir -p /app/data && addgroup -S taployal && adduser -S taployal -G taployal \
  && chown -R taployal:taployal /app
USER taployal

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=4s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/api/health || exit 1

CMD ["node", "server/index.js"]
