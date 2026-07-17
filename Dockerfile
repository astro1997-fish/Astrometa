FROM node:20-slim

WORKDIR /app

# Copy package files and install ALL dependencies (including devDeps for tsc)
COPY backend/package*.json ./
RUN npm install --include=dev

# Copy source and compile TypeScript
COPY backend/ .
RUN npm run build

# Prune devDependencies after build
RUN npm prune --production

EXPOSE 8000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
