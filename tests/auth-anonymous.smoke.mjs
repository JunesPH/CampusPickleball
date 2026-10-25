import assert from "node:assert/strict";

// Run against a local app with Auth0 still unconfigured. Does not mutate data.
const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3100";
for (const method of ["GET", "PUT"]) {
  const response = await fetch(`${base}/api/me`, {
    method,
    ...(method === "PUT" ? { headers: { "Content-Type": "application/json", Origin: base }, body: "{}" } : {}),
  });
  assert.equal(response.status, 401);
  assert.match(response.headers.get("cache-control"), /no-store/);
  console.log(`${method} /api/me: 401, private/no-store`);
}
for (const path of ["/profile", "/profile/setup"]) {
  const response = await fetch(base + path, { redirect: "manual" });
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location"), /^\/auth\/login/);
  console.log(`${path}: redirects to sign-in`);
}
for (const path of ["/auth/profile", "/auth/access-token"]) {
  const response = await fetch(base + path);
  assert.equal(response.status, 404);
  console.log(`${path}: 404`);
}
const login = await fetch(`${base}/auth/login`);
assert.equal(login.status, 503);
console.log("/auth/login: clear 503 while Auth0 is unconfigured");
const home = await fetch(base);
assert.equal(home.status, 200);
assert.match(await home.text(), /Sign-in is being set up/);
console.log("/: 200, setup status visible");
