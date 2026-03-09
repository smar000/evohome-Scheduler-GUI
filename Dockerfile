# Stage 1: Build the frontend
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ENV CI=true
RUN npm exec tsc -- -p tsconfig.app.json
RUN npm exec vite -- build

# Stage 2: Build the backend
FROM node:22-slim AS backend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# We don't want to copy the frontend source or legacy backup
RUN rm -rf frontend legacy_backup
RUN npm run build

# Stage 3: Production image
FROM node:22-slim
LABEL org.opencontainers.image.title="evoweb" \
      org.opencontainers.image.description="evoWeb Heating Schedule Manager"
WORKDIR /app

# Copy backend dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled backend from Stage 2
COPY --from=backend-build /app/dist ./dist

# Copy frontend build from Stage 1 (Vite builds to ../static)
COPY --from=frontend-build /app/static ./static

# Copy other necessary files
COPY data/ ./data/

EXPOSE 3330

# Start from the dist folder
CMD ["npm", "run", "start:evoweb"]
