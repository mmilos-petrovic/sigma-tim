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

## Push notifications in the web app

The app shows notifications through a service worker (`web/public/sw.js`, which only displays a push message and opens the page it names, and caches nothing) and a web app manifest (`manifest.webmanifest`, icons made by `scripts/make-icons.mjs`). Push stays switched off, and its prompts hidden, in a build that has no VAPID public key.

- `VITE_VAPID_PUBLIC_KEY` (Cloudflare Pages variable, one per environment: Production and Preview) is the **public** half of a VAPID key pair. It is not a secret.
- Generate a pair with `node scripts/generate-vapid-keys.mjs`. Use a separate pair for staging and production. The **private** half is a secret: it goes only into the Edge Function secrets of the matching Supabase project (Phase 6c), never into git, a chat or a build variable.
- A device subscribes after the person's first sign-in (a browser only allows it after a tap) and is forgotten when they sign out. On an iPhone or iPad push only works for the app added to the home screen; the app explains this.

## Sending notifications (the Edge Function)

The Edge Function `send-notifications` sends what the database queues: a push to the person's devices, an email through Brevo where the rules say so. A pg_cron job calls it every minute. How it decides is in `supabase/README.md` ("Notifications", "Sending"). Set it up once per environment, staging first:

1. **Make the values.**
   - `CRON_SECRET`: a long random string only the database and the function know. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
   - The VAPID pair from `node scripts/generate-vapid-keys.mjs` (a separate pair per environment). The public half is the same value as `VITE_VAPID_PUBLIC_KEY` of that environment's Cloudflare Pages build; they must match, or devices subscribe with one key and are sent to with another.
   - `BREVO_API_KEY`: in Brevo, SMTP & API, API keys, Generate. The sender `noreply@sigmatim.com` is the one already verified for sign-in emails.
2. **Set the function's secrets** in the Supabase dashboard (Edge Functions, Secrets) of that project, or with `npx supabase secrets set --project-ref <ref> NAME=value`:

   | Name | Value |
   | --- | --- |
   | `CRON_SECRET` | the random string |
   | `APP_URL` | the address of the site, for the links in emails: `https://staging.sigma-tim.pages.dev` or `https://sigmatim.com` |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | the pair |
   | `BREVO_API_KEY` | the Brevo key |

   Optional: `VAPID_SUBJECT` (default `mailto:noreply@sigmatim.com`), `EMAIL_FROM`, `EMAIL_FROM_NAME`, `EMAIL_DAILY_LIMIT` (default 200 non-urgent emails a day, which keeps the rest of Brevo's 300 for welcome emails and for sign-in). `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase.
3. **Tell the database where the function is** (SQL editor of that project, once; the secret is the same `CRON_SECRET`):

   ```sql
   select vault.create_secret('https://<project ref>.supabase.co/functions/v1/send-notifications', 'notifications_function_url');
   select vault.create_secret('<the CRON_SECRET value>', 'notifications_cron_secret');
   ```

   Until both exist the cron job does nothing. To change one later, edit it in the dashboard's Vault page rather than creating it again.
4. **Deploy the function.** The **Functions deploy** workflow deploys it to staging when `supabase/functions/` changes on `main` (the `staging` environment may ask for approval), and by hand to either environment from the Actions tab (target, and untick "dry run" to really deploy; production waits for its reviewer). A dry run only checks that the function's secrets are set and lists what is deployed. The function's own secrets are never in GitHub.
5. **Try it.** As administrator open Podešavanja and press "Pošalji probno obaveštenje": within a minute the notice shows as sent in the log, and the administrator gets the push (if a device is subscribed) and the email. `select * from cron.job_run_details order by start_time desc limit 5` shows the cron job running, and `select * from net._http_response order by created desc limit 5` what the function answered (200, or 401 when the two secrets differ).

## Google sign-in setup

Each environment has its own Google OAuth client, so a mistake or a deletion in one cannot break the other. Production and staging live in two separate Google Cloud projects, each with its own consent screen. Name things clearly (`Sigma Tim staging - Supabase`, `Sigma Tim production - Supabase`) so nobody deletes the wrong client: deleting a client makes sign-in fail with `Error 401: deleted_client` until it is restored (Google keeps deleted clients for 30 days) or replaced.

To set up an environment (about 10 minutes):

1. **Google Cloud project.** Create a project (for example `Sigma Tim Staging`) under the account that owns the school's cloud.
2. **Consent screen** (Google Auth Platform): app name `Sigma Tim (staging)` or `Sigma Tim`, user support and developer email, audience **External**.
3. **Data access:** scopes `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile` only. With these three no Google verification review is needed.
4. **Audience:** staging stays in **Testing** with the people who test as **test users** (anyone else gets `403 access_denied`). Production is **In production**; strangers can sign in with Google but see "Još niste član škole" because the database gives them nothing.
5. **Authorized domain** (under Branding) is optional without branding links. If set, it must be the project's own domain (`<project ref>.supabase.co`); `supabase.co` itself is refused.
6. **OAuth client:** type **Web application**. Leave JavaScript origins empty. Authorized redirect URI, exactly: `https://<project ref>.supabase.co/auth/v1/callback`.
7. **Secret:** copy the client ID and secret when the client is created (Google may show the secret only once; otherwise add a new secret in the client's settings). Never put it in chat or git.
8. **Supabase:** Authentication → Sign In / Providers → Google → enable, paste client ID and secret, save. Check that the callback URL shown there equals the redirect URI from step 6. Leave "Skip nonce checks" off. Authentication → URL Configuration is a separate setting and does not change.
9. **Test:** open the site, press **Prijavi se Google nalogom**, approve, and you should land in the app.

A Google account keeps the same internal ID across different OAuth clients, so replacing a client does not change who is who: existing users and profiles stay linked.

| Symptom | Cause |
| --- | --- |
| `deleted_client` | Supabase still has the ID of a deleted client. |
| `invalid_client` / 401 | Mistyped client ID or secret. |
| `redirect_uri_mismatch` | The redirect URI in Google differs from the Supabase callback URL (a space, a trailing slash, or the other project's ref). |
| `403 access_denied` | The consent screen is in Testing and the account is not a test user. |
| "Još niste član škole" after signing in | Sign-in works; the account has no approved profile (see `supabase/README.md`, "How access works"). |
