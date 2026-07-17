FROM node:20-slim

WORKDIR /app

# Install a stable TypeScript version globally so tsc is available during build
RUN npm install -g typescript@5

# Copy package files and install all dependencies
COPY backend/package*.json ./
RUN npm install --include=dev

# Copy source and compile TypeScript
COPY backend/ .
RUN npm run build

# Prune devDependencies after build so the final image stays lean
RUN npm prune --production

EXPOSE 8000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
