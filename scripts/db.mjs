import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { getPool } from "../src/lib/db.mjs";
import { courts, university } from "../db/seed-data.mjs";

// Same loader as Next.js; quiet mode prevents configuration logging.
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info() {}, error() {} });

class SetupError extends Error {}
function requireState(condition, message) {
  if (!condition) throw new SetupError(message);
}

async function migrationFiles() {
  const directory = new URL("../db/migrations/", import.meta.url);
  const names = (await readdir(directory)).filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  requireState(names.length > 0, "No migration files found.");
  return Promise.all(names.map(async (name) => {
    const sql = await readFile(new URL(name, directory), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
}

async function migrationState(client, files, requireAll = false) {
  const { rows } = await client.query("SELECT name, checksum FROM campus_pickleball.schema_migrations ORDER BY name");
  requireState(rows.length <= files.length, "Database has migrations absent from this checkout.");
  rows.forEach((row, i) => requireState(
    row.name === files[i].name && row.checksum === files[i].checksum,
    "Migration history differs from this checkout. Restore applied files; add a new migration for changes.",
  ));
  if (requireAll) requireState(rows.length === files.length, "Pending migrations: run npm run db:migrate.");
  return rows.length;
}

async function migrate(client) {
  const files = await migrationFiles();
  const schema = await client.query("SELECT 1 FROM pg_namespace WHERE nspname = 'campus_pickleball'");
  if (!schema.rowCount) {
    await client.query("CREATE SCHEMA campus_pickleball");
    await client.query(`CREATE TABLE campus_pickleball.schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  } else {
    const ledger = await client.query("SELECT to_regclass('campus_pickleball.schema_migrations') IS NOT NULL AS present");
    requireState(ledger.rows[0].present, "Existing campus_pickleball schema has no migration ledger; refusing to modify it.");
  }
  const applied = await migrationState(client, files);
  for (const file of files.slice(applied)) {
    await client.query(file.sql);
    await client.query("INSERT INTO campus_pickleball.schema_migrations (name, checksum) VALUES ($1, $2)", [file.name, file.checksum]);
  }
  return { migrationsApplied: files.slice(applied).map((file) => file.name), migrationsTotal: files.length };
}

async function seed(client) {
  await migrationState(client, await migrationFiles(), true);
  await client.query(`INSERT INTO campus_pickleball.universities (id, name, region) VALUES ($1, $2, $3)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, region = EXCLUDED.region`,
  [university.id, university.name, university.region]);
  for (const court of courts) {
    const timezone = await client.query("SELECT 1 FROM pg_timezone_names WHERE name = $1", [court.timezone]);
    requireState(timezone.rowCount === 1, "Seed timezone is not recognized by PostgreSQL.");
    await client.query(`INSERT INTO campus_pickleball.courts (id, university_id, name, address, timezone)
      VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET
      university_id = EXCLUDED.university_id, name = EXCLUDED.name,
      address = EXCLUDED.address, timezone = EXCLUDED.timezone`,
    [court.id, university.id, court.name, court.address, court.timezone]);
  }
  return { seededUniversities: 1, seededVenues: courts.length };
}

async function check(client) {
  const { rows } = await client.query(`SELECT current_setting('server_version') AS postgres_version,
    current_setting('transaction_read_only') AS read_only,
    ssl, version AS tls_version FROM pg_stat_ssl WHERE pid = pg_backend_pid()`);
  requireState(rows[0]?.ssl === true, "Connection is not using TLS.");
  return rows[0];
}

async function verify(client) {
  const connection = await check(client);
  const files = await migrationFiles();
  await migrationState(client, files, true);
  const tables = await client.query(`SELECT c.relname AS name, c.relkind AS kind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'campus_pickleball' AND c.relkind IN ('r', 'p', 'v', 'm', 'f') ORDER BY c.relname`);
  const expected = ["courts", "profiles", "schema_migrations", "session_members", "sessions", "universities"];
  requireState(JSON.stringify(tables.rows.map((row) => row.name)) === JSON.stringify(expected)
    && tables.rows.every((row) => row.kind === "r"), "Expected six ordinary tables, including the migration ledger.");
  const constraints = await client.query(`SELECT t.relname AS table_name, c.conname AS name,
    c.contype AS type, c.convalidated AS validated, pg_get_constraintdef(c.oid) AS definition,
    CASE WHEN c.contype = 'f' THEN c.confrelid::regclass::text END AS references_table
    FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'campus_pickleball' ORDER BY t.relname, c.conname`);
  requireState(constraints.rows.filter((row) => row.type === "f").length === 6
    && constraints.rows.every((row) => row.validated), "Foreign keys are missing or unvalidated.");
  for (const [table, column, target] of [
    ["courts", "university_id", "universities"],
    ["profiles", "university_id", "universities"],
    ["sessions", "host_id", "profiles"],
    ["sessions", "court_id", "courts"],
    ["session_members", "session_id", "sessions"],
    ["session_members", "profile_id", "profiles"],
  ]) {
    requireState(constraints.rows.some((row) => row.table_name === table && row.type === "f"
      && row.definition.startsWith(`FOREIGN KEY (${column})`)
      && [target, `campus_pickleball.${target}`].includes(row.references_table)),
    "A foreign key does not match the specification relationship.");
  }
  requireState(constraints.rows.filter((row) => row.type === "p").length === 6,
    "Primary keys are missing.");
  const membersKey = constraints.rows.find((row) => row.table_name === "session_members" && row.type === "p");
  requireState(membersKey?.definition === "PRIMARY KEY (session_id, profile_id)", "Participant composite primary key differs.");
  const indexes = await client.query(`SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'campus_pickleball' ORDER BY indexname`);
  for (const name of ["courts_university_idx", "profiles_university_idx", "sessions_host_starts_idx",
    "sessions_court_starts_idx", "sessions_scheduled_starts_idx", "session_members_profile_idx"]) {
    requireState(indexes.rows.some((row) => row.indexname === name), "An application query index is missing.");
  }
  requireState(constraints.rows.some((row) => row.table_name === "profiles" && row.type === "u"
    && row.definition === "UNIQUE (auth_subject)"), "Unique auth_subject constraint is missing.");
  const seededUniversity = await client.query("SELECT id, name, region FROM campus_pickleball.universities WHERE id = $1", [university.id]);
  requireState(JSON.stringify(seededUniversity.rows[0]) === JSON.stringify(university), "Penn State seed is missing or differs.");
  const venues = await client.query(`SELECT c.id, c.university_id, c.name, c.address, c.timezone
    FROM campus_pickleball.courts c JOIN campus_pickleball.universities u ON u.id = c.university_id
    WHERE c.id = ANY($1::uuid[]) ORDER BY c.id`, [courts.map((court) => court.id)]);
  requireState(venues.rows.length === courts.length && venues.rows.every((row, i) =>
    row.university_id === university.id && ["id", "name", "address", "timezone"].every((key) => row[key] === courts[i][key])),
  "Seeded courts or their university relationships differ.");
  const counts = await client.query(`SELECT
    (SELECT count(*) FROM campus_pickleball.universities) AS universities,
    (SELECT count(*) FROM campus_pickleball.courts) AS courts,
    (SELECT count(*) FROM campus_pickleball.profiles) AS profiles,
    (SELECT count(*) FROM campus_pickleball.sessions) AS sessions,
    (SELECT count(*) FROM campus_pickleball.session_members) AS session_members`);
  return { connection, migrations: files.map((file) => file.name), tables: tables.rows,
    constraints: constraints.rows, indexes: indexes.rows, counts: counts.rows[0],
    university: seededUniversity.rows[0], venues: venues.rows };
}

async function main() {
  const command = process.argv[2];
  requireState(["check", "migrate", "seed", "verify"].includes(command), "Usage: npm run db:{check|migrate|seed|verify}");
  const pool = getPool();
  try {
    const client = await pool.connect();
    try {
      const readOnly = command === "check" || command === "verify";
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      await client.query("SET LOCAL lock_timeout = '10s'");
      if (!readOnly) {
        // Serialize this app's migrations and seeds, with automatic release on rollback.
        await client.query("SELECT pg_advisory_xact_lock(624319, 2601)");
      }
      const result = await ({ check, migrate, seed, verify })[command](client);
      await client.query("COMMIT");
      console.log(JSON.stringify({ command, status: "ok", ...result }, null, 2));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // pg messages/details/stacks can include SQL values or connection information.
  const safeMessage = error instanceof SetupError || /^(DATABASE_URL|Use only sslmode)/.test(error.message)
    ? error.message : "Database operation failed. Check local connection settings, network access, CA, and schema permissions.";
  const safeCode = typeof error.code === "string" && /^[A-Z0-9_]{2,50}$/.test(error.code) ? ` (${error.code})` : "";
  console.error(`${safeMessage}${safeCode}`);
  process.exitCode = 1;
});
