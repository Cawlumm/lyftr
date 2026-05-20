#!/usr/bin/env bash
#
# Provision the Lyftr translation project on a self-hosted Weblate instance.
#
# This talks to the Weblate REST API to create one project ("Lyftr") and one
# component ("Web") wired to this repo's locale files. Run it ONCE, after your
# self-hosted Weblate is up and you have an admin API token.
#
#   Settings → API access → generate a token
#
# Usage:
#   WEBLATE_URL=https://weblate.example.com \
#   WEBLATE_TOKEN=wlu_xxx \
#   scripts/weblate-provision.sh
#
# The component uses the "GitHub pull request" VCS backend (vcs=github), so the
# instance must already have GitHub credentials configured (WEBLATE_GITHUB_TOKEN
# / WEBLATE_GITHUB_USERNAME in the Weblate container env) — otherwise component
# creation fails. See TRANSLATING.md.

set -euo pipefail

: "${WEBLATE_URL:?Set WEBLATE_URL, e.g. https://weblate.example.com}"
: "${WEBLATE_TOKEN:?Set WEBLATE_TOKEN (Settings → API access)}"

# --- Lyftr-specific values -------------------------------------------------
PROJECT_NAME="Lyftr"
PROJECT_SLUG="lyftr"
PROJECT_WEB="https://github.com/Cawlumm/lyftr"

COMPONENT_NAME="Web"
COMPONENT_SLUG="web"
REPO="https://github.com/Cawlumm/lyftr.git"
BRANCH="main"
FILEMASK="web/src/locales/*.json"
TEMPLATE="web/src/locales/en.json"   # monolingual base + template for new langs
SOURCE_LANGUAGE="en"

# Version-sensitive identifiers — confirm against your instance if creation
# rejects them (GET ${API}/file-formats/ lists valid file_format slugs):
#   FILE_FORMAT : i18next JSON v4
#   VCS         : "github" == the GitHub pull request backend (opens PRs)
FILE_FORMAT="${FILE_FORMAT:-i18nextv4}"
VCS="${VCS:-github}"
# ---------------------------------------------------------------------------

API="${WEBLATE_URL%/}/api"
AUTH=(-H "Authorization: Token ${WEBLATE_TOKEN}")

# POST helper: prints HTTP status + body, fails the script on a 4xx/5xx that
# isn't a duplicate (Weblate returns 400 with "already exists" on re-runs).
post() {
  local url="$1"; shift
  local out status body
  out="$(curl -sS -w $'\n%{http_code}' "${AUTH[@]}" "$url" "$@")"
  status="${out##*$'\n'}"
  body="${out%$'\n'*}"
  echo "  → HTTP ${status}"
  if [[ "$status" -ge 400 ]]; then
    if grep -qiE 'already exists|must be unique' <<<"$body"; then
      echo "  (already exists — skipping)"
      return 0
    fi
    echo "$body" >&2
    return 1
  fi
}

echo "Creating project '${PROJECT_SLUG}' on ${WEBLATE_URL} ..."
post "${API}/projects/" \
  --data-urlencode "name=${PROJECT_NAME}" \
  --data-urlencode "slug=${PROJECT_SLUG}" \
  --data-urlencode "web=${PROJECT_WEB}"

echo "Creating component '${PROJECT_SLUG}/${COMPONENT_SLUG}' ..."
post "${API}/projects/${PROJECT_SLUG}/components/" \
  --data-urlencode "name=${COMPONENT_NAME}" \
  --data-urlencode "slug=${COMPONENT_SLUG}" \
  --data-urlencode "repo=${REPO}" \
  --data-urlencode "push=${REPO}" \
  --data-urlencode "branch=${BRANCH}" \
  --data-urlencode "vcs=${VCS}" \
  --data-urlencode "file_format=${FILE_FORMAT}" \
  --data-urlencode "filemask=${FILEMASK}" \
  --data-urlencode "template=${TEMPLATE}" \
  --data-urlencode "new_base=${TEMPLATE}" \
  --data-urlencode "source_language=${SOURCE_LANGUAGE}"

echo
echo "Done. Open ${WEBLATE_URL}/projects/${PROJECT_SLUG}/${COMPONENT_SLUG}/ to verify."
echo "Translators can now add a language; Weblate will open a PR against '${BRANCH}'."
