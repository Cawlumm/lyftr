# Stage 1: Frontend — build static assets
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build

# Stage 2: Backend — cross-compile Go binary
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS backend
ARG TARGETOS TARGETARCH
WORKDIR /build
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -ldflags="-s -w" -o lyftr-api .

# Stage 3: Runtime — nginx serves frontend + proxies /api/ to Go backend
FROM nginx:alpine
RUN apk add --no-cache ca-certificates wget

# Go backend
COPY --from=backend /build/lyftr-api /app/lyftr-api

# React frontend
COPY --from=frontend /app/dist /usr/share/nginx/html

# nginx config (proxies /api/ → localhost:3000)
COPY fly/nginx.fly.conf /etc/nginx/conf.d/default.conf

# Scripts
COPY fly/entrypoint.sh /app/entrypoint.sh
COPY fly/reset.sh      /app/reset.sh
RUN chmod +x /app/entrypoint.sh /app/reset.sh

RUN mkdir -p /app/data

EXPOSE 80

ENTRYPOINT ["/app/entrypoint.sh"]
