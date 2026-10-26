# Environments and deployment

| | Web app | Supabase project | Deployed from |
| --- | --- | --- | --- |
| Production | `https://sigmatim.com` | ref `gwkmptdhlzmhzztlcqco` | branch `main` (Cloudflare Pages, automatic) |
| Staging | `https://staging.sigma-tim.pages.dev` | ref `wxrzcoxwnvxkplnekunl` | branch `staging` (Cloudflare Pages, automatic) |
| Pull request preview | `https://<branch>.sigma-tim.pages.dev` and `https://<hash>.sigma-tim.pages.dev` | the staging project | any other branch |
| Local | `http://127.0.0.1:5173` | local Docker stack (`npm run dev`) | your working copy |

Every `*.sigma-tim.pages.dev` address (staging and previews) is behind Cloudflare Access. Both Supabase projects have Google sign-in configured; the staging project's redirect URLs allow `http://localhost:5173/**` and `https://*.sigma-tim.pages.dev/**`.

## The fixed staging address

`staging` is a long-lived branch that only exists to be deployed. Never merge it into anything and never work on it: it is overwritten on purpose.

To see a branch on `https://staging.sigma-tim.pages.dev`:

```
npm run deploy:staging      # force-pushes the current commit to the staging branch
```

Cloudflare builds it within a minute or two (the "Cloudflare Pages" check on the commit lists the URL). It uses the Preview environment variables, so it talks to the staging Supabase project.

The web app and the database move separately. A branch with new migrations shows up on staging against a database that does not have them yet, until they are applied there. The usual order is therefore two pull requests: the database part first (merging it applies the migrations to staging), then the app.

## How a change reaches production

1. Pull request: CI runs (`web`: format, lint, typecheck, unit tests, build; `database`: pgTAP and the concurrency test). Cloudflare builds a preview.
2. Merge into `main`: Cloudflare deploys the web app to production. If `supabase/migrations/` changed, the **Database migrate** workflow applies them to staging (the `staging` environment may ask for approval).
3. Production database: run **Database migrate** by hand with target `production` (dry run first). The `production` environment waits for the required reviewer.

## Workflows

- **CI**: on every pull request and push to `main`.
- **Database migrate**: staging automatically after a merge that touches migrations; production and manual runs from the Actions tab. Only runs from `main`.
- **Bootstrap admin**: creates the first administrator (`supabase/bootstrap/`), manual, dry run by default. See `supabase/README.md`.

Secrets live in GitHub environments and in the Cloudflare and Supabase dashboards, never in the repository.
