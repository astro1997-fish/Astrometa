FROM node:20-slim

WORKDIR /app

# Copy pre-built dist and package files
COPY backend/dist/ ./dist/
COPY backend/package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

EXPOSE 8000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
