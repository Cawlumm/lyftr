variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID (passed via TF_VAR_cloudflare_account_id from a GitHub secret)."
}

# The Cloudflare Pages project. Direct-upload style (no `source` block) — GitHub Actions builds
# the site and pushes content with `wrangler pages deploy`, so Terraform only owns the project
# itself. `main` is the production branch; every other branch becomes a preview deployment.
resource "cloudflare_pages_project" "lyftr" {
  account_id        = var.cloudflare_account_id
  name              = "lyftr"
  production_branch = "main"
}

output "pages_subdomain" {
  description = "The *.pages.dev subdomain for the project."
  value       = cloudflare_pages_project.lyftr.subdomain
}
