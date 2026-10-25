import assert from 'node:assert/strict';
// Read-only anonymous HTTP checks; works with configured or unconfigured Auth0.
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3100';
const response = await fetch(`${base}/api/games`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{}' });
assert.equal(response.status, 401);
assert.match(response.headers.get('cache-control'), /private, no-store/);
console.log('POST /api/games: 401, private/no-store');
for (const method of ['POST', 'DELETE']) {
  const membership = await fetch(`${base}/api/games/11111111-1111-4111-8111-111111111111/membership`, { method, headers: { Origin: base } });
  assert.equal(membership.status, 401);
  assert.match(membership.headers.get('cache-control'), /private, no-store/);
  console.log(`${method} membership: 401, private/no-store`);
}
const cancel = await fetch(`${base}/api/games/11111111-1111-4111-8111-111111111111/cancel`, { method: 'POST', headers: { Origin: base } });
assert.equal(cancel.status, 401);
assert.match(cancel.headers.get('cache-control'), /private, no-store/);
console.log('POST cancellation: 401, private/no-store');
for (const path of ['/games/new', '/my-games']) {
  const page = await fetch(base + path, { redirect: 'manual' });
  if (page.status === 307) assert.match(page.headers.get('location'), /^\/auth\/login/);
  else {
    // A loading boundary can stream HTTP 200 before redirect() emits its meta.
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /http-equiv="refresh" content="1;url=\/auth\/login/);
    assert.doesNotMatch(html, /<h1[^>]*>Create a game/);
  }
  console.log(`${path}: redirects to sign-in`);
}
for (const path of ['/games', '/games?skill=3&date=2099-08-01', '/games?skill=all']) {
  const page = await fetch(base + path);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Upcoming games/); assert.match(html, /Filter games/);
  assert.match(html, /each court/);
  assert.doesNotMatch(html, /Games are temporarily unavailable/);
  console.log(`${path}: public discovery and filters render`);
}
const invalidFilter = await fetch(`${base}/games?date=2099-02-30`);
assert.match(await invalidFilter.text(), /Choose a valid calendar date/);
for (const path of ['/games/not-a-uuid', '/games/11111111-1111-4111-8111-111111111111']) {
  const page = await fetch(base + path);
  if (page.status !== 404) {
    assert.equal(page.status, 200);
    assert.match(await page.text(), /NEXT_HTTP_ERROR_FALLBACK;404/);
  }
  console.log(`${path}: 404`);
}
