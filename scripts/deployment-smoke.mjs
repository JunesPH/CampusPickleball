import assert from 'node:assert/strict';

// Anonymous requests only. Never print auth redirect URLs or cookie values.
const base = new URL(process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3100');
const publicHttps = base.protocol === 'https:';
assert.equal(base.pathname, '/');
assert.ok(publicHttps || ['127.0.0.1', 'localhost'].includes(base.hostname));
async function request(path, init = {}) {
  return fetch(new URL(path, base), { ...init, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
}
const home = await request('/');
assert.equal(home.status, 200);
assert.doesNotMatch(await home.text(), /Sign-in is being set up/);
console.log('Homepage: configured, HTTP 200');
for (const method of ['GET', 'PUT']) {
  const response = await request('/api/me', { method, ...(method === 'PUT' ? {
    headers: { Origin: base.origin, 'Content-Type': 'application/json' }, body: '{}',
  } : {}) });
  assert.equal(response.status, 401);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
}
for (const path of ['/auth/profile', '/auth/access-token']) {
  assert.equal((await request(path)).status, 404);
}
console.log('Anonymous profile operations denied; SDK token/profile endpoints blocked');
const login = await request('/auth/login');
assert.ok([302, 303, 307].includes(login.status));
const destination = new URL(login.headers.get('location'));
assert.equal(destination.protocol, 'https:');
assert.equal(destination.searchParams.get('redirect_uri'), new URL('/auth/callback', base).href);
const cookies = login.headers.getSetCookie();
assert.ok(cookies.length > 0);
if (publicHttps) assert.ok(cookies.every(cookie => /;\s*Secure(?:;|$)/i.test(cookie)));
assert.ok(cookies.every(cookie => /;\s*HttpOnly(?:;|$)/i.test(cookie)));
console.log('Login: Auth0 redirect uses the configured callback; transaction cookies protected');
if (publicHttps) {
  const http = new URL(base);
  http.protocol = 'http:';
  const response = await fetch(http, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  assert.ok([301, 302, 307, 308].includes(response.status));
  assert.equal(new URL(response.headers.get('location'), http).origin, base.origin);
  console.log('HTTP redirects to canonical HTTPS; trusted TLS connection succeeded');
}
await import('../tests/games-anonymous.smoke.mjs');
console.log('Anonymous deployment checks passed. Real login and device checks remain separate.');
