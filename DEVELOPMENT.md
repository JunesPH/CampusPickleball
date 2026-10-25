# Campus Pickleball development

The foundation uses the official `create-next-app` starter with Next.js App Router,
React, TypeScript, Tailwind CSS, ESLint, and npm. Auth0 login and database-backed
player setup/editing are implemented; Auth0 account configuration is still required
for a real login test.

## Local setup

Node.js 24 is recommended (scaffolded with Node.js 24.14.1 and npm 11.11.0).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Changes to `src/app/page.tsx` appear automatically.
The signed-out homepage works without external services and shows when sign-in
setup is incomplete. Player pages require Auth0 and Tiger Cloud configuration;
see the Auth0 setup below and [database setup](db/README.md).

## Checks and production preview

```sh
npm run lint
npm run build
npm start
```

Run `npm start` after a successful build to preview the production app locally.

## Main files and folders

- `src/app/`: App Router routes, shared layout, global styles, and favicon.
  `page.tsx` is the homepage; `layout.tsx` sets page metadata and the document shell.
- `src/app/globals.css`: Tailwind import and global styling.
- `public/`: Static assets served directly from the site root.
- `package.json` and `package-lock.json`: npm commands and locked dependencies.
- `next.config.ts`, `tsconfig.json`, and `eslint.config.mjs`: Framework,
  TypeScript, and lint configuration. `postcss.config.mjs` connects Tailwind.
  The dev and build commands use Next.js’s supported Webpack option because the
  starter’s Turbopack CSS worker could not open a local port in this environment.
- `.next/` and `node_modules/`: Generated build output and installed packages,
  both ignored by Git.

The original `README.md` and `Campus_Pickleball_Website_Specification.md` are
preserved. The database foundation and authentication/profile implementation are
present. Game APIs, join/leave behavior, and hosting remain future work.

## Database foundation

Copy `.env.example` to `.env.local` and configure the existing Tiger Cloud service
locally. Keep credentials out of chat, source files, and `NEXT_PUBLIC_` variables.
See [db/README.md](db/README.md) for configuration, verified court sources,
migration safety, scope, and verification results.

```sh
npm run db:check
npm run db:migrate
npm run db:seed
npm run db:verify
```

Run migration and seed again to check repeatability. `db:check` and `db:verify`
use read-only transactions. `npm run test:db` checks connection safety offline.

## Auth0 login and player profiles

The app uses `@auth0/nextjs-auth0` v4.33.0 with Universal Login and Next.js
16.4.3's `src/proxy.ts` convention. The installed SDK's peer range includes this
Next.js and React version. Auth0 manages identity and credentials; Tiger Cloud
stores display name, university, and self-reported skill level. Migration
`002_skill_ratings.sql` converts the original categories to numeric ratings; run
`npm run db:migrate` before using the updated profile form. Existing levels map
to 2.0 (Novice), 3.0 (Intermediate), and 4.0 (Advanced), including session ranges.

### Finish local Auth0 configuration

1. In the [Auth0 Dashboard](https://manage.auth0.com), select your tenant, open
   **Applications → Applications**, and select or create a **Regular Web
   Application** for Campus Pickleball. No paid resources are required by this
   code. Use Universal Login and enable one basic sign-in connection for the
   application (for example, the tenant's database username/password connection).
2. In that application's settings, save these exact local allowlist entries:

   | Setting | Local value |
   | --- | --- |
   | Allowed Callback URLs | `http://localhost:3000/auth/callback` |
   | Allowed Logout URLs | `http://localhost:3000` |
   | Allowed Web Origins | `http://localhost:3000` |

3. Add the Auth0 entries from `.env.example` to your existing ignored `.env.local`.
   Preserve the configured `DATABASE_URL`; do not copy over the whole file.
   Set `AUTH0_DOMAIN` to the tenant hostname, `AUTH0_CLIENT_ID` and
   `AUTH0_CLIENT_SECRET` to that application's settings, and `APP_BASE_URL` to
   `http://localhost:3000`. Generate `AUTH0_SECRET` as 32 random bytes encoded as
   64 hex characters **locally**, and put it directly in your editor. Never paste
   these values into chat, logs, screenshots, source code, or `NEXT_PUBLIC_`
   variables. One way to generate and copy the cookie secret on macOS without
   printing it is `openssl rand -hex 32 | pbcopy`.
4. Restart `npm run dev`, open `http://localhost:3000`, and choose **Sign in**.
   Always use the same hostname and port as `APP_BASE_URL` and the allowlists.
   A different local port requires updating all three allowlists and the base URL.

For production, set `APP_BASE_URL` to the exact public HTTPS origin and register
its `/auth/callback`, logout origin, and web origin in Auth0. The app accepts only
an HTTPS origin or HTTP `localhost`/`127.0.0.1` for local development. Cookies are
HTTP-only and SameSite=Lax, with Secure enabled for HTTPS. Retain SDK-managed
transaction cookies and the broad proxy matcher so session renewal works.
Configure the reverse proxy for the canonical origin and avoid caching account
pages or API responses. Do not disable TLS verification for Auth0 or PostgreSQL.

### Routes and server boundaries

- `/auth/login`, `/auth/callback`, `/auth/logout`: SDK-managed routes. Login
  always returns through `/profile`; caller-supplied return destinations are
  intentionally ignored so onboarding runs consistently. Callback failures go to
  `/sign-in-error` with a retry link and no raw OAuth error details.
- `/profile`: signed-in player editing; absent profiles redirect to
  `/profile/setup`. `/` sends signed-in players through the same profile gate.
- `/profile/setup`: available to signed-in players without a profile. Existing
  profiles redirect to `/profile`. No incomplete database row is created on login.
- `GET /api/me`: 401 signed out, 404 without a saved profile, otherwise the current
  player's public profile fields. `PUT /api/me` creates or edits that same profile.
  It accepts `display_name`, `university_id`, and `skill_level` only. No caller may
  choose another identity. Auth0 subjects and tokens are never returned. SDK
  `/auth/profile` and `/auth/access-token` are blocked; the token endpoint is also
  disabled in SDK options.
- `src/lib/require-profile.ts`: reusable server-page gate requiring sign-in and a
  complete saved profile. Future game APIs must independently enforce equivalent
  authentication/profile requirements and return API status codes; a page gate
  alone does not authorize an API write.
- `src/lib/profiles.mjs`: explicit-column, parameterized database operations using
  the existing server-only pool. Universities come from the seeded database.
  Saves trim names to 1–80 characters, accept an existing university UUID and an
  numeric skill level from 2.0 to 5.5 in 0.5 steps, and atomically upsert by unique `auth_subject`.
  Creation time is preserved and update time advances on edits. The skill labels
  are 2.0 — Novice, 3.0 — Intermediate, and 4.0 — Advanced; other choices
  have no labels, and 5.5 is displayed as 5.5+. Affiliation is self-declared.
- `src/lib/me-handler.mjs`: session-derived authorization, exact canonical Origin
  validation and same-origin fetch metadata checks for PUT, JSON/body size
  validation (4 KiB), sanitized 503 failures, and private/no-store responses.
  Cross-origin or missing-origin mutations return 403; invalid input returns 400.

Forms include labels, keyboard focus, save progress, success feedback, validation
and retry states. Database failures show a recoverable profile-page error screen.
Missing Auth0 configuration leaves the signed-out homepage available; auth routes
return 503 and profile APIs remain unauthorized. This is not a fallback identity.

### Verification and remaining external check

Commands:

```sh
npm run lint
npm run build
npm run test:db
npm run test:profiles
npm run test:profiles:db
```

The last command requires the configured Tiger Cloud database and network access.
It creates one uniquely named `test|campus-profile-…` identity, exercises six
concurrent saves, edits and rereads it, and removes that disposable profile in
`finally`. It never changes other players or the seeded universities/courts.
If interrupted before cleanup, inspect only those test identities locally.

October 24, 2026 verification:

- `npm run lint` and `npm run build` passed, including TypeScript and production
  route generation. Webpack emits a warning about the SDK's dynamic crypto import
  in `dpopUtils.js`; DPoP is not enabled by this app. The warning remains visible.
- Production HTTP smoke checks passed with Auth0 unconfigured: home returns 200
  with setup status, GET/PUT `/api/me` return 401 with private/no-store headers,
  both profile pages redirect to sign-in, blocked SDK endpoints return 404, and
  login returns an explicit setup-incomplete 503. To repeat against an unconfigured
  local server on port 3100, run `node tests/auth-anonymous.smoke.mjs` (or set
  `SMOKE_BASE_URL`). No browser was available for visual/mobile verification.
- Read-only `npm run db:verify` passed after the live profile test: migrations and
  seeds unchanged, universities=1, courts=3, profiles=0, sessions=0,
  session_members=0. No test profile was left behind.
- The five existing database safety tests and eight profile validation/API
  authorization tests passed. Profile tests cover missing authentication, missing
  profiles, identity injection, invalid skill/name/university formats, malformed
  JSON, oversized bodies, cross-origin requests, private caching, and sanitized
  service failures.
- Live Tiger Cloud profile integration passed: six simultaneous saves produced a
  single row/ID and preserved creation time, edits persisted, unrelated identity
  lookup returned no profile, invalid university selection failed without changing
  the profile, and the disposable record was removed.
- Auth0 credentials are absent locally. Real Universal Login, callback exchange,
  logout, and returning login have **not** been tested against an Auth0 tenant.
  Complete the account configuration above to finish this check.

Manual acceptance after configuration: sign in with a new account, confirm setup
appears, save all three fields, refresh and edit, then log out and sign back in.
Confirm the same saved profile returns, `/profile/setup` redirects to `/profile`,
and a second account has its own setup/profile. Check the form on a phone-width
screen. Signed-out direct GET/PUT `/api/me` must return 401. Try blank/overlong
names and invalid university/skill values; confirm 400 and no changed profile.
Confirm a cross-origin PUT returns 403. Never claim real login verification based
only on database tests.

Official references checked before implementation:
[Auth0 Next.js quickstart](https://auth0.com/docs/quickstart/webapp/nextjs),
[SDK setup and Next.js 16 proxy integration](https://github.com/auth0/nextjs-auth0),
and the installed Next.js guides for proxy, Route Handlers, redirects,
server/client boundaries, and environment variables.
