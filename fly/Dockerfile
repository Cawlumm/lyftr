# Lyftr demo — single-container build for Fly.io
#
# Architecture: nginx (port 80) serves the Expo app's web export and proxies /api/ to
# the Go backend running on localhost:3000 inside the same container.
# A persistent Fly volume at /app/data holds the SQLite DB across deploys.
#
# Hourly demo reset: crond inside the container runs reset.sh every hour,
# which restores lyftr.db from a seed snapshot so the demo stays fresh.
# The seed snapshot is created manually on first deploy (see fly/SETUP.md).

# ── Stage 1: Frontend ────────────────────────────────────────────────────────
# mobile is an npm workspace member, so this installs from the root lockfile. `-w @lyftr/mobile`
# limits it to the app's slice. Mirrors mobile/Dockerfile.web — keep them in step.
FROM --platform=$BUILDPLATFORM node:22-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
COPY mobile/package.json ./mobile/
COPY packages/shared/package.json ./packages/shared/
COPY patches ./patches
RUN npm ci -w @lyftr/mobile --include-workspace-root
COPY packages/shared ./packages/shared
COPY mobile/ ./mobile/
RUN EXPO_NO_TELEMETRY=1 CI=1 npm run export:web -w @lyftr/mobile

# ── Stage 2: Backend ─────────────────────────────────────────────────────────
# CGO_ENABLED=0 produces a fully static binary — no libc dependency in runtime.
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS backend
ARG TARGETOS TARGETARCH
# Version baked into the binary. The deploy workflow passes the git tag/describe.
ARG VERSION=dev
WORKDIR /build
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
# Build via backend/build.sh (copied above) — shared with backend/Dockerfile so the
# version ldflags live in one place and can't drift between the two images.
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH VERSION=$VERSION sh build.sh

# ── Stage 3: Runtime ─────────────────────────────────────────────────────────
FROM nginx:alpine
# ca-certificates: needed for Go TLS (exercise seed fetch from GitHub)
# wget: used in health checks if needed
RUN apk add --no-cache ca-certificates wget

COPY --from=backend /build/lyftr-api     /app/lyftr-api
COPY --from=frontend /app/mobile/dist    /usr/share/nginx/html

# Fly-specific nginx config: proxy_pass uses localhost:3000 (not :3000 service name)
COPY fly/nginx.fly.conf /etc/nginx/conf.d/default.conf
# The same 301 list mobile/Dockerfile.web ships, at the path both configs include.
COPY mobile/nginx.legacy-redirects.conf /etc/nginx/snippets/legacy-redirects.conf

# sed strips Windows \r\n → \n so the #!/bin/sh shebang works on Linux
COPY fly/entrypoint.sh /app/entrypoint.sh
COPY fly/reset.sh      /app/reset.sh
COPY fly/snapshot.sh   /app/snapshot.sh
RUN sed -i 's/\r$//' /app/entrypoint.sh /app/reset.sh /app/snapshot.sh && chmod +x /app/entrypoint.sh /app/reset.sh /app/snapshot.sh

# /app/data is a Fly volume mount — this mkdir is a fallback for local testing
RUN mkdir -p /app/data

EXPOSE 80

ENTRYPOINT ["/app/entrypoint.sh"]
