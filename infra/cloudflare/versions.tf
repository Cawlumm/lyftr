terraform {
  required_version = ">= 1.10"

  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
      # Pinned to the mature v4 line — cloudflare_pages_project is simple + stable here
      # (the v5 schema rewrite churned this resource).
      version = "~> 4.40"
    }
  }

  # Remote state in Cloudflare R2 (S3-compatible). The account-specific endpoint is injected at
  # `terraform init` time via -backend-config (see .github/workflows/infra.yml) so the account ID
  # stays out of source. R2 credentials come from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (GitHub
  # secrets). `use_lockfile` is native S3 locking (Terraform >= 1.10) — no DynamoDB needed.
  backend "s3" {
    bucket = "lyftr-tfstate"
    key    = "cloudflare/pages.tfstate"
    region = "auto"

    use_path_style              = true
    use_lockfile                = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}

# The provider reads the API token from the CLOUDFLARE_API_TOKEN env var (a GitHub Actions
# secret), so no credentials live in code.
provider "cloudflare" {}
