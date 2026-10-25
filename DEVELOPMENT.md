# Campus Pickleball development

The foundation uses the official `create-next-app` starter with Next.js App Router,
React, TypeScript, Tailwind CSS, ESLint, and npm. Auth0 login and database-backed
player setup/editing and game creation are implemented. The user has manually
verified the configured Auth0 flow; see verification below.

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
present. Game creation and details are implemented. Discovery and join/leave behavior
remain future work.

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
  complete saved profile. Game APIs independently enforce equivalent
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

### Authentication verification

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
- Subsequent user-reported manual verification (October 24, 2026): sign-up,
  first-time profile setup, sign-out, sign-in, and saved profile persistence all
  passed against the configured Auth0 tenant. This is manual user verification,
  separate from the automated database/API checks above.

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


## Game creation

Run the existing setup workflow before hosting:

```sh
npm run db:migrate
npm run db:seed
npm run db:verify
```

No new migration is required: the existing `sessions` and `session_members`
tables, including `002_skill_ratings.sql`, support the complete creation model.
Applied migrations are unchanged. The current configured database passed read-only
schema/seed verification, including the numeric skill migration.

Choose **Create game** in the signed-in header, or visit `/games/new`. Pages
require sign-in and a saved profile; missing profiles go to `/profile/setup`.
After login the existing Auth0 flow returns through `/profile`, where the header
provides the creation link. The form chooses an existing court, court-local future
date/time, duration (30–180 minutes), singles/doubles, and a contiguous minimum to
maximum accepted skill range using the shared profile rating definitions. The
range must include the host's current rating. Times are resolved using the stored
court IANA timezone, independent of the browser/server timezone. Invalid calendar
dates and skipped/repeated daylight-saving times are rejected with form errors.

`POST /api/games` independently checks the session (401 if absent), saved profile
(403 if absent), canonical Origin/fetch metadata, JSON content type, a 4 KiB body
limit, and an allowlist of input fields. Host identity comes from the session,
never the submitted body. Input errors return 400; database failures return a
sanitized 503. Responses are private/no-store. The transaction locks the host
profile exclusively and court for consistent reads, checks schedule overlap, inserts the session, inserts its host
membership, and commits using one database client. Any failure rolls back both.

Success navigates to `/games/[id]`, which displays court/address, start/end with
timezone, format, accepted skill range, host, and participants. Details are now
publicly browsable and use a single database snapshot; malformed or missing IDs
produce 404. Creation/details failures have a retry screen. The form keeps entries
on error and disables submission while saving. A game coordinates players and
does not reserve a physical court.

```sh
npm run test:games
npm run test:games:db
node tests/games-anonymous.smoke.mjs # production server on port 3100
```

The live test requires configured database/network access. It creates a unique
`test|campus-game-…` profile, verifies persisted details and automatic host
participation, injects a real membership FK failure to verify rollback, and
removes only its own records in `finally`. Interrupted runs may require local
inspection of those test identities.

October 24, 2026 implementation checks:

- All 20 offline tests passed: seven game tests, eight profile tests, and five
  database safety tests. Game coverage includes input validation, court timezone
  conversion/DST, authentication/profile authorization, CSRF, forged identity,
  JSON/body limits, sanitized errors, transaction commit/rollback, and host
  participation.
- Live game integration passed against PostgreSQL with cleanup. Read-only
  database verification passed with existing migrations and seeds intact.
- Lint and production build passed. The existing Auth0 `dpopUtils.js` dynamic
  import warning remains; DPoP is not enabled by this app.
- Anonymous production HTTP smoke checks passed: `POST /api/games` returns
  401 with private/no-store headers; both game pages redirect to sign-in. Use
  `SMOKE_BASE_URL` to check a different local server origin.
- Browser automation was unavailable (no browser surfaces and the in-app browser
  could not open). Signed-in game form interaction, visual/mobile layout, and
  navigation after submission remain unverified in a browser. The user-verified
  authentication flow above does not establish game-flow verification.

Manual game acceptance: sign in with your saved profile, use **Create game**,
choose a future court-local time and valid skill range, submit, and confirm the
details page lists you as both host and participant. Refresh to check persistence.
Try a past time, reversed range, and range excluding your rating; confirm clear
errors. Check at phone width. The creation-phase checks above are historical;
discovery, joining/leaving, and schedule overlap prevention are covered below.

## Game discovery and membership

Use **Find games** or `/games`. Discovery and detail pages are public; membership
writes still require Auth0 sign-in and a completed profile. Upcoming scheduled
games are ordered by start time and ID, with 20 results per page. Cards show the
court/address, court-local time and IANA timezone, format, accepted rating range,
remaining spots, and the current player's membership or host status.

The GET filter form stores `skill`, `court`, and `date` in the URL; pagination
adds `page` and retains the filters. With no explicit skill filter, a saved
profile defaults to its current rating. `skill=all` explicitly shows every
rating, including after **Clear filters**. A selected skill must fall within the
game's accepted range. A date is matched to the start date in **each court's
local timezone**, not the browser or server timezone. Invalid/duplicate filter
values produce an actionable message. Empty results offer broader filters or
hosting. Loading and retry states are included.

On a detail page, eligible players can join or leave. Successful writes refresh
the roster, membership controls, and available spots from the server. Pending
requests disable the controls; failures show errors without pretending that a
write succeeded. Signed-out players get a sign-in link, and incomplete profiles
get a setup link. The current Auth0 callback still returns through `/profile`;
use **Find games** afterward. Host cancellation has no existing flow, so hosts
see an explanation and cannot leave. Cancellation and My Games remain separate
future features. Cancelled games cannot be joined; participants may leave a
cancelled game before its start. Joining and leaving close at the start.

`POST /api/games/:id/membership` joins, and `DELETE` on the same path leaves.
Both take **no request body**. Identity is resolved from the authenticated
session. They retain canonical-Origin and same-origin fetch-metadata checks,
return private/no-store responses, and use 401 (signed out), 403 (profile or
eligibility/host restriction), 404 (missing game), 409 (full, closed or overlapping
commitment), and sanitized 503 (service failure) responses.

Every create/join/leave transaction locks the acting profile `FOR UPDATE`
before acquiring any existing session's `FOR UPDATE` lock. The profile lock
serializes one player's commitments, and the session lock serializes competing
capacity changes. After waiting for locks, joining/leaving checks a fresh
`clock_timestamp()` from PostgreSQL, avoiding a stale transaction-start time.
Joining checks current skill, status, existing membership, capacity (2 singles,
4 doubles, including the host), and overlapping scheduled commitments. Adjacent
time intervals are allowed. Hosting now shares the profile lock and overlap
check. All checks and the membership write commit or roll back together.

Existing members' repeated joins return success without inserting another row,
including after a rating change or when the roster is full. Repeated leaves do
not remove anyone else's membership. The existing composite membership primary
key also prevents duplicate rows at the database level. Capacity and overlap
are enforced by the transactional locking protocol; future membership writers
must preserve it. No new migration, dependency, or environment variable is
required. Existing database migrations/seeds must already be installed.

Verification for this implementation:

- All 27 offline tests passed (14 game, 8 profile, 5 database safety).
- All 8 PostgreSQL checks passed, including real competing singles/doubles
  joins, simultaneous duplicate joins, overlapping commitments, a confirmed
  database lock wait followed by a started-game rejection, leave/retry behavior,
  eligibility/status/host restrictions, court-local filtering, and rollback.
  The fixtures use unique `test|membership-…` / `test|campus-game-…` identities
  and delete their own games, memberships, and profiles in `finally`.
- Lint, TypeScript, and the production build passed. The existing Auth0
  `dpopUtils.js` dynamic-dependency warning remains.
- Production HTTP smoke checks passed for anonymous write protection, public
  discovery and filters, invalid-filter messages, sign-in gating on creation,
  and missing details. Tests account for Next.js streaming redirects/404s.
- Read-only database verification passed with the existing schema and seeds.
- No browser surfaces are available, so signed-in clicks, keyboard interaction,
  and phone-width visual inspection remain unverified in a browser.

Run `npm run test:games`, `npm run test:games:db`, `npm run test:profiles`,
`npm run test:db`, and `npm run build`. For HTTP smoke checks, start a production
server on port 3100 and run `node tests/games-anonymous.smoke.mjs`; override
`SMOKE_BASE_URL` for a different origin. Database checks require the configured
database connection and network access.

Manual acceptance: host a future singles game, open it from **Find games** on
another eligible account, join, refresh both accounts to confirm the same roster,
then leave and confirm the spot reopens. Try another account while full, an
ineligible rating, overlapping game times, and a started/cancelled game. Verify
the host cannot leave, filter URLs survive refresh, and **Clear filters** resets
the visible controls. Check the flow at phone width and with keyboard navigation.


## My Games and host cancellation

`/my-games` requires a completed profile and lists future games hosted or joined
by the current session's player, ordered by start time with 20 results per page.
Hosting and joined roles are labeled, and cancelled games remain visible until
their scheduled start. Participants may still leave a cancelled game, as with the
existing membership convention; leaving removes it from their My Games list.

Hosts can cancel from game details using a confirmation dialog.
`POST /api/games/:id/cancel` accepts no body, requires same-origin requests and
an authenticated profile, and derives the actor only from the Auth0 session.
The transaction locks the actor profile then the session, checks ownership and
the fresh database clock, and updates the existing status column. Cancellation
is idempotent, cannot be undone, and is closed after the game starts. Rosters are
retained so participants can see cancellations. Discovery and overlap checks
already consider only scheduled games; cancelled games reject all new joins.
No migration or new service is required. Cancellation does not send email or
push notifications; its confirmation explicitly describes visibility in My Games.

Phone layout changes reduce outer/card padding, wrap navigation, give navigation
and buttons at least 44px height, constrain form controls, prevent fieldset
intrinsic overflow, and wrap long names/addresses. Profile and My Games loading
boundaries and a game-not-found page complement existing game loading/error
boundaries. Creation shows a success message on the resulting detail page and
stays disabled while navigating; membership and cancellation show request,
success, and actionable failure feedback.

Verification for this change (October 24, 2026):

- `npm run lint`, `npm run build`, and all 31 offline database/profile/game tests
  passed. Build emits the existing Auth0 `dpopUtils.js` dynamic dependency warning.
- `npm run test:games:db`: all 10 tests passed against the configured PostgreSQL
  service. This includes the full two-player lifecycle with disposable profile
  subjects, cancellation authorization, retained rosters, released schedule
  conflicts, rejected post-cancellation joins, and a join/cancel race. Fixtures
  were cleaned up. These are database identities, not real Auth0 logins.
- `SMOKE_BASE_URL=http://localhost:3000 node tests/games-anonymous.smoke.mjs`
  passed against the local server: public discovery/filter pages render,
  protected creation/My Games redirect, anonymous cancellation/membership/create
  requests return private 401 responses, and missing games return not-found UI.
- The session's browser inventory was empty (in-app browser unavailable).
  Consequently real Auth0 sign-in with two accounts, confirmation-dialog
  interaction, and visual checks at phone viewport sizes were not performed.
  Complete those checks in a connected browser before considering browser QA done.

### Cancellation audit follow-up

The audit inspected the implementation and added regressions for the following
UI defects, which are now fixed:

- Reopening the confirmation clears a previous request's error.
- Cancelled/started games offer nonmembers “Find another game” instead of an
  invitation to sign in/join or a misleading full-game message.
- A cancelled game no longer shows the creation-success banner from `?created=1`.
- Cancellation success requires the response's status to be `cancelled`.
  Unexpected payloads and lost/malformed responses show an error and refresh
  the persisted game state instead of claiming success.

Audit verification:

- Lint and production build passed (the existing Auth0 dynamic dependency
  warning remains). All 31 existing offline database/profile/game tests passed.
- `npm run test:games:ui`: nine tests passed using real React components in
  jsdom. Coverage includes Keep game sending no write, rapid double-clicks
  issuing one request, disabled pending controls, Escape prevention while
  pending, expired-session sign-in links, 403/404/409/503 responses, network and
  malformed-response failures, cancelled detail rendering for both injected
  identities, roles/pagination/empty states, and retryable data errors.
  jsdom is a development-only dependency. Its modal open/close methods are
  shimmed; these tests do not verify native focus trapping or visual layout.
- `npm run test:games:db`: 17 tests passed, including the new cancellation audit.
  A separate SQL connection observed `scheduled` before cancellation and
  `cancelled` after the API handler returned. The roster was unchanged; both
  players' subsequent detail/My Games reads returned cancelled; later join
  handlers returned 409; discovery omitted the game; both players could create
  and join games at the released time. An unrelated fixture remained unchanged.
- The database audit also passed concurrent duplicate cancellations, three
  leave/cancel races, a forced SQL failure after UPDATE with rollback, a real
  lock wait crossing the start time, unauthorized/CSRF/forged-body requests,
  and 24-game pagination excluding past/unrelated games. All 37 audit games
  and four profiles were removed by exact IDs, with zero remaining IDs checked.
- Run with a local server for real anonymous HTTP reload verification:
  `AUDIT_HTTP_BASE_URL=http://localhost:3000 RUN_GAME_DB_TESTS=1 node --conditions=react-server --test tests/game-cancellation.integration.test.mjs`.
  These HTTP checks verify the actual cancelled detail page and retained roster
  on repeated requests, and absence from discovery. The separate anonymous
  HTTP smoke script also verifies sign-in redirects and private 401 writes.

The API-handler tests inject session subjects into the test process and use the
real database; they do not bypass authentication in the application. Page
component tests inject data/auth dependencies. No connected browser was available
in this session. Real Auth0 login with two accounts, native modal keyboard/focus
behavior, back/forward navigation cache behavior, and phone visual/overflow checks
at 320px, 375px, and 390px remain unverified. Existing responsive CSS was inspected,
including the generated dialog width calculation; this is not visual browser QA.
