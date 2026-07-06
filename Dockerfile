FROM node:20-alpine

WORKDIR /app

# Install dependencies from backend
COPY backend/package*.json ./
RUN npm ci

# Copy backend source and build
COPY backend/ .
RUN npm run build

EXPOSE 8000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
