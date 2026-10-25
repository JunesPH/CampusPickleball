import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateGame, courtTimeToDate, createGame, GameInputError, GameProfileError, findGame } from '../src/lib/games.mjs';
import { handleCreateGame } from '../src/lib/games-handler.mjs';
const id = '11111111-1111-4111-8111-111111111111';
const valid = { court_id: id, local_time: '2099-07-01T12:30', duration_minutes: 60, format: 'doubles', skill_min: 2, skill_max: 5.5 };
const base = 'http://localhost:3000';
const request = (body = valid, headers = {}) => new Request(`${base}/api/games`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const deps = (extra = {}) => ({ getSubject: async () => 'auth0|trusted', findProfile: async () => ({ id }), createGame: async (subject, input) => { assert.equal(subject, 'auth0|trusted'); validateGame(input); return { id }; }, appBaseUrl: base, ...extra });

test('validation accepts existing rating scale and rejects forged fields and invalid ranges', () => {
  assert.equal(validateGame(valid), valid);
  for (const input of [null, [], {}, { ...valid, host_id: id }, { ...valid, court_id: 'bad' }, { ...valid, format: 'team' }, { ...valid, duration_minutes: 29 }, { ...valid, duration_minutes: 181 }, { ...valid, duration_minutes: '60' }, { ...valid, skill_min: 3, skill_max: 2 }, { ...valid, skill_min: 2.25 }, { ...valid, skill_max: '5.5' }, { ...valid, local_time: '2099-07-01T12:30Z' }]) assert.throws(() => validateGame(input), GameInputError);
});
test('court time resolution handles offsets, DST, calendar errors, and future-only input', () => {
  assert.equal(courtTimeToDate('2099-07-01T12:30', 'America/New_York').toISOString(), '2099-07-01T16:30:00.000Z');
  assert.equal(courtTimeToDate('2099-01-01T12:30', 'America/New_York').toISOString(), '2099-01-01T17:30:00.000Z');
  for (const local of ['2026-03-08T02:30', '2026-11-01T01:30', '2099-02-30T12:00', '2020-01-01T12:00']) assert.throws(() => courtTimeToDate(local, 'America/New_York'), GameInputError);
});
test('API requires a session and completed profile before writing', async () => {
  const noWrite = () => assert.fail('unauthorized write');
  assert.equal((await handleCreateGame(request(), deps({ getSubject: async () => null, findProfile: noWrite, createGame: noWrite }))).status, 401);
  assert.equal((await handleCreateGame(request(), deps({ findProfile: async () => null, createGame: noWrite }))).status, 403);
  const response = await handleCreateGame(request(), deps());
  assert.equal(response.status, 201); assert.deepEqual(await response.json(), { id });
  assert.match(response.headers.get('cache-control'), /private, no-store/);
});
test('API rejects CSRF, invalid JSON/content type, oversized body, and injected identity', async () => {
  for (const headers of [{ origin: 'https://evil.test' }, { origin: '' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await handleCreateGame(request(valid, headers), deps())).status, 403);
  assert.equal((await handleCreateGame(request(valid, { 'content-type': 'text/plain' }), deps())).status, 400);
  assert.equal((await handleCreateGame(new Request(`${base}/api/games`, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: '{' }), deps())).status, 400);
  for (const body of [{ ...valid, host_id: id }, { junk: 'x'.repeat(5000) }]) assert.equal((await handleCreateGame(request(body), deps())).status, 400);
  const response = await handleCreateGame(request(), deps({ createGame: async () => { throw new Error('private DB URL'); } }));
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private DB/);
});
function fakeDb({ memberFailure = false, profile = { id, skill_level: 3 }, court = { id, timezone: 'America/New_York' } } = {}) {
  const calls = []; let released = false;
  return { calls, get released() { return released; }, connect: async () => ({ release() { released = true; }, query: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('FROM campus_pickleball.profiles')) return { rows: profile ? [profile] : [] };
    if (sql.includes('FROM campus_pickleball.courts')) return { rows: court ? [court] : [] };
    if (sql.includes('INSERT INTO campus_pickleball.sessions')) return { rows: [{ id: 'game-id' }] };
    if (sql.includes('INSERT INTO campus_pickleball.session_members') && memberFailure) throw new Error('private details');
    return { rows: [] };
  } }) };
}
test('creation uses one transaction and automatically adds the session-derived host', async () => {
  const db = fakeDb(); assert.deepEqual(await createGame('trusted-subject', valid, db), { id: 'game-id' });
  assert.equal(db.calls[0].sql, 'BEGIN'); assert.equal(db.calls.at(-1).sql, 'COMMIT');
  assert.deepEqual(db.calls[1].values, ['trusted-subject']);
  const insert = db.calls.find((call) => call.sql.includes('INSERT INTO campus_pickleball.sessions'));
  assert.equal(insert.values[0], id); assert.equal(insert.values[2].toISOString(), '2099-07-01T16:30:00.000Z');
  assert.equal(insert.values[3] - insert.values[2], 3600000);
  assert.deepEqual(db.calls.at(-2).values, ['game-id', id]); assert.ok(db.released);
});
test('membership failures roll back the game; missing profiles/courts and host ineligibility cannot persist', async () => {
  for (const [options, error] of [[{ memberFailure: true }, /temporarily unavailable/], [{ profile: null }, GameProfileError], [{ court: null }, GameInputError], [{ profile: { id, skill_level: 1 } }, GameInputError]]) {
    const db = fakeDb(options); await assert.rejects(createGame('trusted', valid, db), error);
    assert.equal(db.calls.at(-1).sql, 'ROLLBACK'); assert.ok(!db.calls.some((call) => call.sql === 'COMMIT')); assert.ok(db.released);
  }
});
test('invalid detail identifiers return not found without a query', async () => {
  assert.equal(await findGame('bad', { query: () => assert.fail('query') }), null);
});
