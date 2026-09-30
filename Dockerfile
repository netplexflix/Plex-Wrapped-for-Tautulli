# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build the web app (dist/) and the bundled server (dist-server/)
RUN npm run build

# Production stage
FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV DATA_DIR=/data

# The server is bundled into a single file (express and multer included), so no npm install is needed
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

# Create data directory
RUN mkdir -p /data

# Expose port
EXPOSE 2025

# Start the server
CMD ["node", "dist-server/server.cjs"]
