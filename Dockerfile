# Build stage
FROM node:22.2.0-bullseye as builder

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:22.2.0-bullseye-slim

# Install necessary production dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Create a non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs

# Copy built assets from builder stage
COPY --from=builder --chown=nodejs:nodejs /usr/src/app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /usr/src/app/package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000

# Switch to non-root user
USER nodejs

# Expose the port the app runs on
EXPOSE $PORT

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD wget -q --spider http://localhost:$PORT/health || exit 1
