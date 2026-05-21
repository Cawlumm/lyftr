# Stage 1: Build — run on host platform to avoid QEMU slowness for npm/node
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM nginx:alpine

# Backend upstream for the /api proxy. Override at runtime (compose/`docker run -e`)
# when the backend runs on a non-default port, e.g. BACKEND_ORIGIN=backend:3008.
ENV BACKEND_ORIGIN=backend:3000
# Only substitute our own var so nginx runtime vars ($host, $uri, ...) are left intact.
ENV NGINX_ENVSUBST_FILTER=BACKEND_ORIGIN

# Custom nginx config for SPA + API proxy. nginx's entrypoint renders templates in
# /etc/nginx/templates/*.template through envsubst into /etc/nginx/conf.d/ on start.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
