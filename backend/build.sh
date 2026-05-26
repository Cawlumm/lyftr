#!/bin/sh
# Single source of truth for the backend Go build, shared by backend/Dockerfile and
# fly/Dockerfile so the version-injection ldflags can't drift between the two images.
# The cross-compile vars (CGO_ENABLED/GOOS/GOARCH) and VERSION are supplied by the
# calling RUN's environment; VERSION falls back to "dev" for local/untagged builds.
set -eu

go build \
  -ldflags="-s -w -X github.com/Cawlumm/lyftr-backend/config.buildVersion=${VERSION:-dev}" \
  -o lyftr-api .
