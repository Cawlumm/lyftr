# Cloudflare infra (Terraform) — parked scaffolding

**Status: not wired yet.** The Cloudflare Pages *project* is currently provisioned by an
idempotent `wrangler pages project create` step in `.github/workflows/site.yml` — "project as
code" with **no Terraform state to store anywhere**. That's the right call while it's a single
resource.

Promote to this Terraform when the infra grows past one project — specifically when adding the
**`lyftr.dev` custom domain + DNS records**, where tracked state and `plan`-before-apply start to
earn their keep. At that point:

1. Pick a state backend (CI is ephemeral, so local state won't do):
   - **Cloudflare R2** — your own bucket, all-in-Cloudflare (S3 backend + a few `skip_*` flags).
   - **HCP Terraform** free tier — simplest remote state; set the workspace execution to *Local*
     so `terraform` still runs in GitHub Actions.
   - GitHub itself is **not** an option — it has no real TF state backend (committing state leaks
     secrets and has no locking; Actions cache/artifacts have no locking and get evicted).
2. Add the `backend` block in `versions.tf`.
3. Add `cloudflare_pages_domain` + `cloudflare_record` resources for `lyftr.dev`.
4. Add a workflow that runs `terraform plan` on PRs and `apply` on `main`, with
   `TF_VAR_cloudflare_account_id` + `CLOUDFLARE_API_TOKEN` from GitHub secrets.

Files here (`versions.tf`, `main.tf`) already declare the provider + the `cloudflare_pages_project`
so the promotion is mostly adding the backend + domain resources and importing the existing project
(`terraform import cloudflare_pages_project.lyftr <account_id>/lyftr`).
