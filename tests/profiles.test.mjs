import assert from "node:assert/strict";
import { test } from "node:test";
import { validateProfile, ProfileInputError, findProfile } from "../src/lib/profiles.mjs";
import { handleMe } from "../src/lib/me-handler.mjs";

const valid = { display_name: "  Rally Player  ", university_id: "11111111-1111-4111-8111-111111111111", skill_level: 2 };
const base = "http://localhost:3000";
function request(method = "PUT", body = valid, headers = {}) {
  return new Request(`${base}/api/me`, {
    method,
    headers: { origin: base, "content-type": "application/json", ...headers },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}
function dependencies(overrides = {}) {
  return {
    getSubject: async () => "auth0|trusted-session",
    findProfile: async () => null,
    saveProfile: async (_subject, input) => validateProfile(input),
    appBaseUrl: base,
    ...overrides,
  };
}

test("profile validation trims names and accepts only half-point ratings from 2.0 through 5.5", () => {
  assert.equal(validateProfile(valid).display_name, "Rally Player");
  for (const skill_level of [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]) assert.equal(validateProfile({ ...valid, skill_level }).skill_level, skill_level);
  for (const input of [null, [], {}, { ...valid, display_name: "  " }, { ...valid, display_name: "a".repeat(81) },
    { ...valid, display_name: 3 }, { ...valid, university_id: "not-a-uuid" },
    ...[0, 1, 1.5, 2.25, 3.1, 5.75, 6, NaN, Infinity, -Infinity, "2", null, true].map((skill_level) => ({ ...valid, skill_level })),
    { ...valid, auth_subject: "auth0|victim" }, { ...valid, id: "victim" }]) {
    assert.throws(() => validateProfile(input), ProfileInputError);
  }
});

test("unauthenticated reads and writes return 401 before any database access", async () => {
  const deps = dependencies({ getSubject: async () => null, findProfile: () => assert.fail("DB read"), saveProfile: () => assert.fail("DB write") });
  for (const method of ["GET", "PUT"]) {
    const response = await handleMe(request(method), deps);
    assert.equal(response.status, 401);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
});

test("GET distinguishes missing profiles and reads only the session subject", async () => {
  assert.equal((await handleMe(request("GET"), dependencies())).status, 404);
  const response = await handleMe(new Request(`${base}/api/me?id=victim`), dependencies({
    findProfile: async (subject) => {
      assert.equal(subject, "auth0|trusted-session");
      return { id: "own-profile", display_name: "Player", skill_level: 2.5 };
    },
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, "own-profile");
  assert.match(response.headers.get("cache-control"), /private, no-store/);
});

test("PUT rejects missing, foreign, null origins and conflicting fetch metadata", async () => {
  const deps = dependencies({ saveProfile: () => assert.fail("unsafe write") });
  for (const headers of [{ origin: "https://evil.example" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }]) {
    assert.equal((await handleMe(request("PUT", valid, headers), deps)).status, 403);
  }
  const missing = request();
  missing.headers.delete("origin");
  assert.equal((await handleMe(missing, deps)).status, 403);
  assert.equal((await handleMe(request(), dependencies({ appBaseUrl: undefined }))).status, 403);
});

test("PUT validates JSON, body size, fields, and session-bound ownership", async () => {
  const deps = dependencies();
  assert.equal((await handleMe(request("PUT", valid, { "content-type": "text/plain" }), deps)).status, 400);
  assert.equal((await handleMe(new Request(`${base}/api/me`, { method: "PUT", headers: { origin: base, "content-type": "application/json" }, body: "{" }), deps)).status, 400);
  assert.equal((await handleMe(request("PUT", { ...valid, display_name: "x".repeat(5000) }), deps)).status, 400);
  assert.equal((await handleMe(request("PUT", { ...valid, skill_level: "2" }), deps)).status, 400);
  assert.equal((await handleMe(request("PUT", { ...valid, auth_subject: "victim" }), deps)).status, 400);
  const saved = await handleMe(request(), dependencies({ saveProfile: async (subject, input) => {
    assert.equal(subject, "auth0|trusted-session");
    return validateProfile(input);
  } }));
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).display_name, "Rally Player");
});

test("unknown universities are 400 and database failures are sanitized", async () => {
  const invalid = await handleMe(request(), dependencies({ saveProfile: async () => { throw new ProfileInputError("Choose a university from the list."); } }));
  assert.equal(invalid.status, 400);
  const unavailable = await handleMe(request("GET"), dependencies({ findProfile: async () => { throw new Error("secret database URL"); } }));
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /secret database/);
});

test("profile lookup parameterizes identity and omits the Auth0 subject column", async () => {
  const subject = "auth0|' OR true --";
  const result = await findProfile(subject, { query: async (sql, values) => {
    assert.deepEqual(values, [subject]);
    assert.doesNotMatch(sql, /SELECT[^]*auth_subject[^]*FROM/);
    assert.match(sql, /WHERE auth_subject = \$1/);
    assert.ok(!sql.includes(subject));
    return { rows: [] };
  } });
  assert.equal(result, null);
});

test("database errors are sanitized before server page rendering can log them", async () => {
  await assert.rejects(findProfile("auth0|player", { query: async () => {
    throw new Error("postgresql://private-secret@private-host");
  } }), { message: "Player data is temporarily unavailable." });
});
