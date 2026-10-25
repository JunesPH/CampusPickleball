import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { spawnSync } from "node:child_process";
import { getPool } from "../src/lib/db.mjs";

const originalUrl = process.env.DATABASE_URL;
const originalCa = process.env.DATABASE_SSL_CA_FILE;
afterEach(async () => {
  await globalThis.campusPickleballPool?.end();
  delete globalThis.campusPickleballPool;
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
  if (originalCa === undefined) delete process.env.DATABASE_SSL_CA_FILE;
  else process.env.DATABASE_SSL_CA_FILE = originalCa;
});

test("missing and malformed configuration fail without exposing credentials", () => {
  delete process.env.DATABASE_URL;
  assert.throws(getPool, /DATABASE_URL is missing/);
  process.env.DATABASE_URL = "secret-that-must-never-be-printed";
  assert.throws(getPool, { message: "DATABASE_URL must be a valid PostgreSQL URL." });
});

test("Tiger require mode cannot override certificate verification; pool is reused", () => {
  delete process.env.DATABASE_SSL_CA_FILE;
  process.env.DATABASE_URL = "postgresql://user:placeholder@example.invalid:5432/db?sslmode=require";
  const pool = getPool();
  assert.equal(pool.options.ssl.rejectUnauthorized, true);
  assert.equal(new URL(pool.options.connectionString).search, "");
  assert.equal(pool.totalCount, 0, "initialization must not connect at build/import time");
  assert.equal(pool, getPool());
});

test("unencrypted modes and SSL override parameters are rejected", () => {
  for (const query of ["sslmode=disable", "sslmode=prefer", "sslmode=allow", "sslmode=no-verify", "sslmode=verify-full&sslrootcert=untrusted.pem", "ssl=false", "uselibpqcompat=true"]) {
    process.env.DATABASE_URL = `postgresql://user:placeholder@example.invalid/db?${query}`;
    assert.throws(getPool);
  }
});

test("invalid custom CA fails closed without opening a connection", () => {
  process.env.DATABASE_URL = "postgresql://user:placeholder@example.invalid/db?sslmode=verify-full";
  process.env.DATABASE_SSL_CA_FILE = "/nonexistent-campus-pickleball-ca.pem";
  assert.throws(getPool, { code: "ENOENT" });
  assert.equal(globalThis.campusPickleballPool, undefined);
});

test("server-only guard rejects imports outside the server condition", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", 'import("./src/lib/db.mjs")'], {
    cwd: new URL("../", import.meta.url), encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Client Component/);
});
