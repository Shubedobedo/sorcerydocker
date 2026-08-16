# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --production

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy built app and production dependencies
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.js ./
COPY --from=builder /app/src/lib/db ./src/lib/db

# Create data directory for SQLite
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/sorcery.db
ENV ORIGIN=http://localhost:3000

# Start the app
CMD ["node", "build"]
