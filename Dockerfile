# Stage 1: Build the frontend
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the backend
FROM node:22-slim AS backend-build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# We don't want to copy the frontend source
RUN rm -rf frontend
RUN npm run build

# Stage 3: Production image
FROM node:22-slim
WORKDIR /app

# Copy backend dependencies
COPY package*.json ./
RUN npm install --production

# Copy compiled backend from Stage 2
COPY --from:backend-build /app/dist ./dist

# Copy frontend build to static directory (sibling to dist)
COPY --from:frontend-build /app/frontend/dist ./static

# Copy other necessary files
COPY .env.example ./.env
COPY config/ ./config/

EXPOSE 3330

# Start from the dist folder
CMD ["node", "dist/index.js"]
