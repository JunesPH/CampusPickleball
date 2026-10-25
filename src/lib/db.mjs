import "server-only";
import { readFileSync } from "node:fs";
import pg from "pg";

/** @type {typeof globalThis & { campusPickleballPool?: import("pg").Pool }} */
const databaseGlobal = globalThis;

/** Lazy: importing this module never needs credentials or opens a connection. */
export function getPool() {
  if (databaseGlobal.campusPickleballPool) return databaseGlobal.campusPickleballPool;
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is missing; configure .env.local.");
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.pathname.slice(1)) {
    throw new Error("DATABASE_URL must include a PostgreSQL host, user, and database.");
  }
  // pg's connection-string SSL options can override the explicit TLS object.
  // Accept Tiger's require/verify modes, then enforce certificate + hostname checks.
  const mode = url.searchParams.get("sslmode");
  if (mode && !["require", "verify-ca", "verify-full"].includes(mode)) {
    throw new Error("DATABASE_URL must require TLS (use sslmode=verify-full).");
  }
  for (const key of url.searchParams.keys()) {
    if (key !== "sslmode") throw new Error("Use only sslmode in DATABASE_URL query parameters; configure the CA with DATABASE_SSL_CA_FILE.");
  }
  url.searchParams.delete("sslmode");
  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl: {
      rejectUnauthorized: true,
      ...(process.env.DATABASE_SSL_CA_FILE
        ? { ca: readFileSync(process.env.DATABASE_SSL_CA_FILE, "utf8") }
        : {}),
    },
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 30_000,
    application_name: "campus-pickleball",
    options: "-c timezone=UTC -c search_path=campus_pickleball,pg_catalog",
  });
  // Never log connection strings, pg errors, profile data, or SQL parameters.
  pool.on("error", () => console.error("Campus Pickleball: idle database connection failed."));
  databaseGlobal.campusPickleballPool = pool;
  return pool;
}
