# Campus Pickleball database foundation

This phase uses Tiger Cloud PostgreSQL through `pg`, with ordinary tables in the
isolated `campus_pickleball` schema. It creates no services, paid resources,
hypertables, extensions, authentication integration, APIs, or hosting.

## Local configuration

1. Run `npm ci` (Node.js 24 recommended).
2. Run `cp .env.example .env.local`.
3. In a local editor, replace `DATABASE_URL` with the **PostgreSQL service URL**
   from your existing Tiger Cloud service. Select the service in Tiger Console,
   then `Service info` → `Connect` → `More details`. Use its database name, host,
   port, user and password, not Tiger REST API credentials. Do not create a
   service or change an account plan for these scripts.
4. Use Tiger's hostname rather than its IP address for certificate verification.
   URL-encode special characters in username/password. Prefer
   `?sslmode=verify-full`; Tiger's `sslmode=require` is accepted and strengthened
   to certificate and hostname verification. Other URL query parameters are
   rejected so they cannot override the explicit TLS configuration.
5. If required, set `DATABASE_SSL_CA_FILE` to an absolute path to a trusted CA
   PEM file. Otherwise Node's trusted CAs are used.

`.env.local` and other `.env*` files are ignored; only `.env.example` is allowed
in Git. Never use `NEXT_PUBLIC_` for database configuration or put credentials in
chat, source, shell command arguments, or screenshots. The scripts do not print
URLs, passwords, raw database errors, or stack traces.

Next.js loads root env files automatically. Scripts use its documented
`@next/env` loader, defaulting to development configuration including
`.env.local`; `NODE_ENV=production` uses production configuration. Existing
process variables take precedence. In Next env files a literal `$` must be
escaped as `\$`; percent-encoding credentials avoids this issue.

Tiger's strict SSL guide notes that new services initially have a self-signed
certificate, normally replaced within about 30 minutes, and free services do not
supply SSL certificates. If verification fails, check the service's certificate
support and trusted chain. Keep verification enabled; do not upgrade/provision
resources automatically. An unsupported certificate can block live verification.

## Commands

Run from the repository root:

```sh
npm run db:check
npm run db:migrate
npm run db:seed
npm run db:verify
```

| Command | Behavior |
| --- | --- |
| `db:check` | Read-only connection/TLS check, reporting PostgreSQL/TLS versions and read-only status. Works before migrations. |
| `db:migrate` | Creates the isolated app schema and migration ledger, then applies pending numbered SQL files in order. |
| `db:seed` | Transactionally upserts Penn State and three venues by stable UUID. Requires current migrations; adds no fake profiles, sessions, or memberships. |
| `db:verify` | Read-only snapshot checking migration checksums, ordinary tables, validated FK targets, primary keys, unique auth subject, membership composite key, expected query indexes, and exact seed records and university links. Reports constraints, indexes, and row counts. |
| `test:db` | Offline tests for fail-closed configuration, verified TLS, SSL override prevention, lazy pool creation, and pool reuse. |

Repeat migration and seed, then verification. The second migration run should
report zero applied files. Repeating seed updates only its four curated UUID
records, creates no duplicates, and does not delete other data. Fresh database
counts should be universities=1, courts=3, profiles=0, sessions=0,
session_members=0.

Initial migration requires permission to create the app schema; subsequent
migrations require ownership of its objects. Scripts do not create roles,
databases, grants, or extensions or alter objects in other schemas.

## Server connection

`src/lib/db.mjs` imports `server-only`: Next.js rejects Client Component imports.
Use lazy `getPool()` in future server code with parameterized queries (`$1`,
`$2`, etc.) and the Node.js runtime, not Edge. Importing it does not read
credentials or open a connection, so the placeholder homepage/build works
without a database. The pool is reused during development reloads, with at most
five connections **per Node process**, a 10 second connection timeout, 30 second
idle/query timeouts, and UTC connection timezone.

For transactions, acquire one client using `pool.connect()`, use it for every
statement, and release it in `finally`. Do not call `pool.end()` per web request.
CLI commands release their client and close the pool on success or failure.
Their `--conditions=react-server` flag allows Node to use the same guarded module
outside Next.js; it does not expose the module to browsers.

## Migrations and model boundaries

`001_core_tables.sql` implements UUID entity keys, six foreign keys, unique
Auth0 subject, required fields, skill levels 1–3, ordered skill range,
singles/doubles formats, scheduled/cancelled status, 30–180 minute duration,
finite timestamps, a 300 character notes limit, and composite participant key.
Timestamps use `timestamptz`; court timezone stores the IANA name. FK deletion
uses PostgreSQL's default NO ACTION to protect referenced records/history.

`002_query_indexes.sql` supports campus lookups, host/court schedules, upcoming
scheduled discovery, and participant history/overlap queries. The membership
primary key already indexes roster/count queries.

Migrations and seeds serialize using a transaction advisory lock. All pending
migrations and their SHA-256 ledger entries commit atomically; failures roll
back. An existing schema without the app ledger is rejected. Changed, removed,
or out-of-order applied migrations are rejected. Add a new numbered migration
instead of editing applied SQL. No destructive reset/down command is provided.

Future-start validation, eligibility, capacity (2 singles / 4 doubles), host
membership, cancellation authorization, and overlap rules require the future
server validation and locking protocol in the specification. These behaviors
are **not implemented** by this database-only phase. A time-relative
`CHECK (starts_at > now())` would become false for valid historical sessions,
so it is not included. Future profile writes must maintain `updated_at`; future
court writes must validate the IANA timezone. Notes are text; future UI must
escape them.

## Verified seed sources

Reviewed October 24, 2026. Each `courts` row represents a venue without inventing
individual court numbers, hours, live availability, or reservations.
`university_id` associates nearby community venues with Penn State for discovery;
it does not imply university ownership, endorsement, or access rights. All three
use `America/New_York` for local time, including daylight-saving changes.

| Venue | Address | Authoritative verification |
| --- | --- | --- |
| Bernel Road Park | 2501 Bernel Road, State College, PA | [Patton Township 2026–2030 parks plan](https://twp.patton.pa.us/DocumentCenter/View/1344/1_FINAL_2026_2030_PattonTownshipParksandBikePedPathPlan) confirms address and pickleball facilities. |
| Suburban Park | 101 Suburban Avenue, State College, PA 16803 | [Ferguson Township park page](https://www.twp.ferguson.pa.us/1624/Suburban-Park) confirms location and pickleball/tennis amenities. |
| High Point Park | 855 Whitehall Road, State College, PA 16801 | [CRPR official facility listing](https://crpr.recdesk.com/Community/Facility/Detail?facilityId=99) confirms location and tennis/pickleball court. |

[CRPR's court policy](https://www.crpr.org/policies/links/athletic-field-use-scheduling-policy)
also lists all three as pickleball venues. It lists Green Hollow as tennis-only,
so older pickleball references to that park were not used for seeding.

**A Campus Pickleball session organizes players; it does not reserve a physical
court.** Players must follow venue rules and independently confirm access and any
operator requirements. No court booking integration is included.

## Official connection references

Checked before implementation on October 24, 2026:

- [Tiger Cloud connection details](https://www.tigerdata.com/docs/integrate/find-connection-details/): existing service credentials and PostgreSQL clients.
- [Tiger PostgreSQL examples](https://www.tigerdata.com/docs/integrate/query-administration/psql/): service URL and `verify-full` mode.
- [Tiger strict SSL guide](https://www.tigerdata.com/docs/deploy/tiger-cloud/tiger-cloud-aws/security/strict-ssl/): trusted certificate chains and service limitations.
- [Tiger app integrations](https://www.tigerdata.com/docs/integrate/code/connect-your-app/): PostgreSQL drivers, including `pg` in the Node example. This project uses `pg` directly, with no ORM.
- [node-postgres SSL](https://node-postgres.com/features/ssl) and [pooling](https://node-postgres.com/features/pooling): explicit TLS, URL overrides, and client release.
- Installed Next.js guides: `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` and `01-app/01-getting-started/05-server-and-client-components.md`.

## Verification results

October 24, 2026:

- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript and static page generation.
- `npm run test:db`: all five offline connection-safety tests passed, including the server-only import guard.
- `npm run db:check`: passed against the configured Tiger Cloud service using
  PostgreSQL 18.6 and TLS 1.3, with certificate verification enabled. The check
  transaction reported `read_only=on`. The sandbox initially could not resolve
  the service hostname; the network-authorized run succeeded.
- `npm run db:migrate`: applied `001_core_tables.sql` and
  `002_query_indexes.sql`. A second run passed with zero pending migrations.
- `npm run db:seed`: seeded Penn State and Bernel Road Park, Suburban Park, and
  High Point Park. A second run passed without duplicate records.
- `npm run db:verify`: passed before and after the repeat run. Confirmed all
  five application tables plus the migration ledger are ordinary tables; all
  six foreign keys are validated and point to the expected tables. Confirmed
  primary keys, unique Auth0 subject, membership composite key, all six query
  indexes, migration checksums, exact seed values, and court/university links.
- Final row counts: universities=1, courts=3, profiles=0, sessions=0,
  session_members=0. No sample players or games were created.
- Lint, the five offline tests, and the production build were rerun successfully
  after local configuration. `.env.local` is ignored and is not tracked by Git.

The database foundation is live and verified. Future authentication and game
behavior remain outside this phase. Only sanitized verification summaries are
recorded here; credentials and private service identifiers are omitted.
