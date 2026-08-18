# Stage 1: Build the Vite React application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy source files
COPY . .

# Build production bundle into /app/dist
RUN npm run build

# Stage 2: Serve the application with Nginx (Cloud Run Port 8080)
FROM nginx:alpine

# Copy built assets to Nginx html directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration with SPA fallback and port 8080
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose standard Cloud Run port
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
