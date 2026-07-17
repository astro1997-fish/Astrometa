FROM node:20-slim

WORKDIR /app

# Copy lock files first for better layer caching
COPY backend/package.json ./package.json
COPY backend/package-lock.json ./package-lock.json

# Install only production dependencies using the exact lock file
RUN npm ci --omit=dev

# Copy pre-built dist
COPY backend/dist/ ./dist/

EXPOSE 8000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
