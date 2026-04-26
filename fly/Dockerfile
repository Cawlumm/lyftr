# Lyftr demo — single-container build for Fly.io
#
# Architecture: nginx (port 80) serves the React SPA and proxies /api/ to
# the Go backend running on localhost:3000 inside the same container.
# A persistent Fly volume at /app/data holds the SQLite DB across deploys.
#
# Hourly demo reset: crond inside the container runs reset.sh every hour,
# which restores lyftr.db from a seed snapshot so the demo stays fresh.
# The seed snapshot is created manually on first deploy (see fly/SETUP.md).

# ── Stage 1: Frontend ────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# ── Stage 2: Backend ─────────────────────────────────────────────────────────
# CGO_ENABLED=0 produces a fully static binary — no libc dependency in runtime.
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS backend
ARG TARGETOS TARGETARCH
WORKDIR /build
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -ldflags="-s -w" -o lyftr-api .

# ── Stage 3: Runtime ─────────────────────────────────────────────────────────
FROM nginx:alpine
# ca-certificates: needed for Go TLS (exercise seed fetch from GitHub)
# wget: used in health checks if needed
RUN apk add --no-cache ca-certificates wget

COPY --from=backend /build/lyftr-api     /app/lyftr-api
COPY --from=frontend /app/dist           /usr/share/nginx/html

# Fly-specific nginx config: proxy_pass uses localhost:3000 (not :3000 service name)
COPY fly/nginx.fly.conf /etc/nginx/conf.d/default.conf

# sed strips Windows \r\n → \n so the #!/bin/sh shebang works on Linux
COPY fly/entrypoint.sh /app/entrypoint.sh
COPY fly/reset.sh      /app/reset.sh
RUN sed -i 's/\r$//' /app/entrypoint.sh /app/reset.sh && chmod +x /app/entrypoint.sh /app/reset.sh

# /app/data is a Fly volume mount — this mkdir is a fallback for local testing
RUN mkdir -p /app/data

EXPOSE 80

ENTRYPOINT ["/app/entrypoint.sh"]
