import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cancelGame, listMyGames, GameMembershipError, GameProfileError } from '../src/lib/games.mjs';
import { handleCancellation } from '../src/lib/cancellation-handler.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const playerId = '22222222-2222-4222-8222-222222222222';
const base = 'http://localhost:3000';
const request = (headers = {}, body, method = 'POST') => new Request(`${base}/api/games/${id}/cancel`, { method, headers: { origin: base, ...headers }, body });
const deps = (overrides = {}) => ({ getSubject: async () => 'trusted', findProfile: async () => ({ id: playerId }), cancelGame: async (subject, gameId) => { assert.equal(subject, 'trusted'); assert.equal(gameId, id); return { status: 'cancelled' }; }, appBaseUrl: base, ...overrides });
const noWrite = () => assert.fail('Unauthorized write');

test('cancellation accepts an empty server body stream but rejects any submitted bytes', async () => {
  for (const content of ['', JSON.stringify({ host_id: playerId }), ' ', '\u0000']) {
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(0));
      if (content) controller.enqueue(new TextEncoder().encode(content));
      controller.close();
    } });
    const incoming = new Request(`${base}/api/games/${id}/cancel`, {
      method: 'POST', headers: { origin: base, 'content-length': '0' }, body: stream, duplex: 'half',
    });
    assert.notEqual(incoming.body, null);
    const response = await handleCancellation(incoming, id, deps(content ? { cancelGame: noWrite } : {}));
    assert.equal(response.status, content ? 400 : 200);
    if (!content) assert.deepEqual(await response.json(), { status: 'cancelled' });
  }
});

test('cancellation API authenticates, rejects forged identity/CSRF and returns private responses', async () => {
  assert.equal((await handleCancellation(request(), id, deps({ getSubject: async () => null, findProfile: noWrite, cancelGame: noWrite }))).status, 401);
  assert.equal((await handleCancellation(request(), id, deps({ findProfile: async () => null, cancelGame: noWrite }))).status, 403);
  for (const headers of [{ origin: '' }, { origin: 'https://evil.test' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }]) {
    assert.equal((await handleCancellation(request(headers), id, deps({ cancelGame: noWrite }))).status, 403);
  }
  assert.equal((await handleCancellation(request({}, JSON.stringify({ host_id: playerId })), id, deps({ cancelGame: noWrite }))).status, 400);
  assert.equal((await handleCancellation(request({}, undefined, 'DELETE'), id, deps({ cancelGame: noWrite }))).status, 405);
  const response = await handleCancellation(request(), id, deps());
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { status: 'cancelled' });
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  for (const status of [403, 404, 409]) assert.equal((await handleCancellation(request(), id, deps({ cancelGame: async () => { throw new GameMembershipError('Expected', status); } }))).status, status);
  assert.equal((await handleCancellation(request(), id, deps({ cancelGame: async () => { throw new GameProfileError('Complete profile'); } }))).status, 403);
  const failed = await handleCancellation(request(), id, deps({ cancelGame: async () => { throw new Error('private credentials'); } }));
  assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /credentials/);
});

function database({ profile = { id: playerId }, game = { host_id: playerId, starts_at: new Date('2099-01-01'), status: 'scheduled' }, fail = false } = {}) {
  const calls = []; let released = false;
  return { calls, get released() { return released; }, connect: async () => ({ release() { released = true; }, query: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('FROM campus_pickleball.profiles')) return { rows: profile ? [profile] : [] };
    if (sql.includes('FROM campus_pickleball.sessions WHERE')) return { rows: game ? [game] : [] };
    if (sql === 'SELECT clock_timestamp() AS now') return { rows: [{ now: new Date('2026-10-24') }] };
    if (sql.startsWith('UPDATE') && fail) throw new Error('private SQL');
    return { rows: [] };
  } }) };
}

test('cancellation locks actor then game, persists status, retains roster and is idempotent', async () => {
  const db = database();
  assert.deepEqual(await cancelGame('trusted', id, db), { status: 'cancelled' });
  assert.match(db.calls[1].sql, /profiles.*FOR UPDATE/);
  assert.deepEqual(db.calls[1].values, ['trusted']);
  assert.match(db.calls[2].sql, /sessions.*FOR UPDATE/);
  assert.equal(db.calls[3].sql, 'SELECT clock_timestamp() AS now');
  assert.deepEqual(db.calls.find(({ sql }) => sql.startsWith('UPDATE')).values, [id]);
  assert.ok(!db.calls.some(({ sql }) => /DELETE|INSERT/.test(sql)));
  assert.equal(db.calls.at(-1).sql, 'COMMIT'); assert.ok(db.released);
  const retry = database({ game: { host_id: playerId, status: 'cancelled', starts_at: new Date('2000-01-01') } });
  await cancelGame('trusted', id, retry);
  assert.ok(!retry.calls.some(({ sql }) => sql.startsWith('UPDATE')));
});

test('non-hosts, missing profiles/games, started games and database failures roll back', async () => {
  for (const [options, expected] of [
    [{ profile: null }, GameProfileError], [{ game: null }, /not found/],
    [{ game: { host_id: id, status: 'cancelled' } }, /Only the host/],
    [{ game: { host_id: playerId, starts_at: new Date('2026-10-24'), status: 'scheduled' } }, /started/],
    [{ fail: true }, /temporarily unavailable/],
  ]) {
    const db = database(options); await assert.rejects(cancelGame('trusted', id, db), expected);
    assert.equal(db.calls.at(-1).sql, 'ROLLBACK'); assert.ok(db.released);
  }
  await assert.rejects(cancelGame('trusted', 'invalid', { connect: noWrite }), /not found/);
});

test('My Games scopes to host or member, includes cancellations and paginates by future start', async () => {
  const result = await listMyGames(playerId, 2, { query: async (sql, values) => {
    assert.match(sql, /s.starts_at > statement_timestamp\(\)/);
    assert.match(sql, /s.host_id = \$1 OR EXISTS/);
    assert.match(sql, /m.profile_id = \$1/);
    assert.doesNotMatch(sql, /status = 'scheduled'/);
    assert.match(sql, /ORDER BY s.starts_at, s.id LIMIT 21 OFFSET \$2/);
    assert.deepEqual(values, [playerId, 20]);
    return { rows: Array.from({ length: 21 }, (_, index) => ({ id: index })) };
  } });
  assert.equal(result.games.length, 20); assert.equal(result.hasNext, true);
  await assert.rejects(listMyGames('invalid', 1, { query: noWrite }), /valid results page/);
  await assert.rejects(listMyGames(playerId, 0, { query: noWrite }), /valid results page/);
});
