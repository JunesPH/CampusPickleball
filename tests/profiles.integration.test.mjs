import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import nextEnv from "@next/env";
import { getPool } from "../src/lib/db.mjs";
import { findProfile, listUniversities, saveProfile, ProfileInputError } from "../src/lib/profiles.mjs";

// Explicit opt-in: creates one disposable profile and removes it in finally.
test("real PostgreSQL: racing saves, identity isolation, persistence, timestamps, and university validation", {
  skip: process.env.RUN_PROFILE_DB_TESTS !== "1",
}, async () => {
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const pool = getPool();
  const subject = `test|campus-profile-${randomUUID()}`;
  let attemptedWrite = false;
  try {
    const universities = await listUniversities();
    assert.ok(universities.length, "Seed a university before this test.");
    const input = { display_name: "Disposable profile test", university_id: universities[0].id, skill_level: 2 };
    attemptedWrite = true;
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => saveProfile(subject, { ...input, skill_level: 2 + index * 0.5 })));
    assert.deepEqual(results.map((row) => row.skill_level), [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]);
    assert.equal(new Set(results.map((row) => row.id)).size, 1);
    assert.equal(new Set(results.map((row) => row.created_at.toISOString())).size, 1);
    const count = await pool.query("SELECT count(*)::int AS count FROM campus_pickleball.profiles WHERE auth_subject = $1", [subject]);
    assert.equal(count.rows[0].count, 1);
    const saved = await findProfile(subject);
    assert.ok(saved);
    assert.ok(!Object.hasOwn(saved, "auth_subject"));
    const edited = await saveProfile(subject, { ...input, display_name: "  Updated test  ", skill_level: 5.5 });
    assert.equal(edited.id, saved.id);
    assert.equal(edited.created_at.toISOString(), saved.created_at.toISOString());
    assert.ok(edited.updated_at >= saved.updated_at);
    assert.equal((await findProfile(subject)).display_name, "Updated test");
    assert.equal((await findProfile(subject)).skill_level, 5.5);
    assert.equal(await findProfile(`test|unrelated-${randomUUID()}`), null);
    await assert.rejects(saveProfile(subject, { ...input, university_id: randomUUID() }), ProfileInputError);
    assert.equal((await findProfile(subject)).display_name, "Updated test");
  } catch {
    // Raw pg errors may reveal service metadata; only output a sanitized failure.
    throw new Error("Profile database integration check failed. Check DB connectivity/schema and test assertions locally.");
  } finally {
    try {
      if (attemptedWrite) await pool.query("DELETE FROM campus_pickleball.profiles WHERE auth_subject = $1", [subject]);
    } catch {
      throw new Error("Could not clean up the disposable test profile; inspect test|campus-profile- records locally.");
    } finally {
      await pool.end();
    }
  }
});
