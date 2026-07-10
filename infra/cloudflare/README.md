# Cloudflare infra (Terraform)

Manages the Cloudflare **Pages project** (and, later, the `lyftr.dev` custom domain + DNS).
State lives in **Cloudflare R2** (free tier). Run by `.github/workflows/infra.yml`:
`terraform plan` on PRs, `terraform apply` on `main` and on-demand (`workflow_dispatch`).

Content is deployed separately — `site.yml` runs `wrangler pages deploy` against this project.

## One-time bootstrap

Do these once (the workflow steps skip until the secrets exist):

1. **R2 bucket for state** — `wrangler r2 bucket create lyftr-tfstate` (or dashboard → R2 → Create
   bucket). Enabling R2 is free; Cloudflare may ask for a card on file.
2. **R2 API token** — R2 → *Manage R2 API Tokens* → create an **Object Read & Write** token →
   copy the **Access Key ID** + **Secret Access Key**.
3. **Cloudflare API token** — My Profile → API Tokens → **Edit Cloudflare Pages** template. Note the
   **Account ID** (Workers & Pages sidebar).
4. **GitHub repo secrets** (UI or `gh secret set` in a real terminal — never paste into a chat/PR):
   | Secret | Value |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | the Pages-edit token |
   | `CLOUDFLARE_ACCOUNT_ID` | account ID |
   | `R2_ACCESS_KEY_ID` | R2 token access key |
   | `R2_SECRET_ACCESS_KEY` | R2 token secret |
5. **Create the project** — Actions → *Infra (Cloudflare)* → **Run workflow** (on `main`). This
   `apply` creates the `lyftr` Pages project. After that, `site.yml` deploys work (prod + previews).

## Notes

- The R2 endpoint (which contains the account ID) is written to `backend.hcl` at CI time from the
  account-ID secret, so it never lives in source. `backend.hcl`, state, and `*.tfvars` are gitignored.
- Locking uses the S3 backend's native `use_lockfile` (Terraform ≥ 1.10) — no DynamoDB.
- If a `lyftr` project already exists (e.g. created manually), import it before the first apply:
  `terraform import cloudflare_pages_project.lyftr <account_id>/lyftr`.
- **Next:** add `cloudflare_pages_domain` + `cloudflare_record` for `lyftr.dev`, and set
  `SITE_URL=https://lyftr.dev` in `site.yml`.
