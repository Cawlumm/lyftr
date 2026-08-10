# Build context is the REPO ROOT, not web/ — web is an npm workspace member and its
# build imports @lyftr/shared from packages/. See docker-compose.yml / ci.yml, and the
# root .dockerignore (BuildKit reads it from the context root, so web/.dockerignore no
# longer applies to this image).

# Stage 1: Build — run on host platform to avoid QEMU slowness for npm/node
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

WORKDIR /app

# Manifests first (layer cache). mobile/package.json is copied but its dependencies are
# never installed: `npm ci` validates the lockfile against every workspace it declares,
# so the file has to exist, while `-w lyfter-web` keeps Expo's toolchain out of the image.
COPY package.json package-lock.json ./
COPY web/package.json ./web/
COPY mobile/package.json ./mobile/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci -w lyfter-web --include-workspace-root

# packages/shared ships as TypeScript source (no build step) — Vite transpiles it.
COPY packages/shared ./packages/shared
COPY web/ ./web/
RUN npm run build -w lyfter-web

# Stage 2: Runtime
FROM nginx:alpine

# Backend upstream for the /api proxy. Override at runtime (compose/`docker run -e`)
# when the backend runs on a non-default port, e.g. BACKEND_ORIGIN=backend:3008.
ENV BACKEND_ORIGIN=backend:3000
# Only substitute our own var so nginx runtime vars ($host, $uri, ...) are left intact.
ENV NGINX_ENVSUBST_FILTER=BACKEND_ORIGIN

# Custom nginx config for SPA + API proxy. nginx's entrypoint renders templates in
# /etc/nginx/templates/*.template through envsubst into /etc/nginx/conf.d/ on start.
COPY web/nginx.conf.template /etc/nginx/templates/default.conf.template

# Copy built assets
COPY --from=builder /app/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
