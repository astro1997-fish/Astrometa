FROM node:20-slim

WORKDIR /app

# Install TypeScript globally so tsc is available during build
RUN npm install -g typescript

# Copy package files and install ALL dependencies (including @types/* for compilation)
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
