import assert from 'node:assert/strict';
// Read-only anonymous HTTP checks; works with configured or unconfigured Auth0.
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3100';
const response = await fetch(`${base}/api/games`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{}' });
assert.equal(response.status, 401);
assert.match(response.headers.get('cache-control'), /private, no-store/);
console.log('POST /api/games: 401, private/no-store');
for (const path of ['/games/new', '/games/11111111-1111-4111-8111-111111111111']) {
  const page = await fetch(base + path, { redirect: 'manual' });
  assert.equal(page.status, 307);
  assert.match(page.headers.get('location'), /^\/auth\/login/);
  console.log(`${path}: redirects to sign-in`);
}
