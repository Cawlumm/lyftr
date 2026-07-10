terraform {
  required_version = ">= 1.6"

  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
      # Pinned to the mature v4 line — cloudflare_pages_project is simple + stable here
      # (the v5 schema rewrite churned this resource).
      version = "~> 4.40"
    }
  }

  # State backend is filled in once you pick one (R2 or Terraform Cloud) — see README.md.
  # CI runs are ephemeral, so local state would make Terraform re-create the project each run.
}

# The provider reads the API token from the CLOUDFLARE_API_TOKEN env var (a GitHub Actions
# secret), so no credentials live in code.
provider "cloudflare" {}
