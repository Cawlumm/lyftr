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

# Copy source and build a statically linked binary
COPY . .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -ldflags="-s -w -X github.com/Cawlumm/lyftr-backend/config.buildVersion=${VERSION}" -o lyftr-api .

# Stage 2: Runtime
FROM alpine:3.19

# ca-certificates for any outbound TLS calls; wget for healthcheck
RUN apk add --no-cache ca-certificates wget

WORKDIR /app

COPY --from=builder /build/lyftr-api .

# Persistent data directory (mount a volume here)
RUN mkdir -p /app/data

EXPOSE 3000

ENTRYPOINT ["/app/lyftr-api"]
