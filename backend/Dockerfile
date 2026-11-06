# Stage 1: Build — run on host platform, cross-compile to target
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS builder

ARG TARGETOS
ARG TARGETARCH
# Version baked into the binary. CI passes the git tag; defaults to "dev" locally.
ARG VERSION=dev

WORKDIR /build

# Download dependencies first (layer cache)
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build the static binary via the shared build script
# (single source of the version ldflags — see backend/build.sh)
COPY . .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH VERSION=$VERSION sh build.sh

# Stage 2: Runtime
FROM alpine:3.23

# ca-certificates for any outbound TLS calls; wget for healthcheck
RUN apk add --no-cache ca-certificates wget

WORKDIR /app

COPY --from=builder /build/lyftr-api .

# Persistent data directory (mount a volume here)
RUN mkdir -p /app/data

EXPOSE 3000

# /health is public and answers once migrations have run and the router is listening.
# -O /dev/null, not --spider: the apk wget above is GNU wget, whose --spider sends HEAD, and
# Gin answers HEAD on a GET route with 404. Shell form so a custom PORT is followed. The long
# start period is for a Raspberry Pi running migrations; probes inside it every 2s still mark
# the container healthy as soon as it answers (--start-interval takes effect on Docker
# Engine 25+).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --start-interval=2s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/health" || exit 1

ENTRYPOINT ["/app/lyftr-api"]
