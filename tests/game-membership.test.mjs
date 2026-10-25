import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeMembership, GameMembershipError, GameProfileError, GameInputError, parseGameFilters, listGames } from '../src/lib/games.mjs';
import { handleMembership } from '../src/lib/membership-handler.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const playerId = '22222222-2222-4222-8222-222222222222';
const base = 'http://localhost:3000';
const request = (method = 'POST', headers = {}, body) => new Request(`${base}/api/games/${id}/membership`, { method, headers: { origin: base, ...headers }, ...(body === undefined ? {} : { body }) });
const deps = (extra = {}) => ({ getSubject: async () => 'auth0|trusted', findProfile: async () => ({ id: playerId }), changeMembership: async (subject, game, joining) => {
  assert.equal(subject, 'auth0|trusted'); assert.equal(game, id); return { joined: joining };
}, appBaseUrl: base, ...extra });

test('membership API uses session identity, requires authentication/profile and returns uncached results', async () => {
  const noWrite = () => assert.fail('unauthorized write');
  assert.equal((await handleMembership(request(), id, deps({ getSubject: async () => null, findProfile: noWrite, changeMembership: noWrite }))).status, 401);
  assert.equal((await handleMembership(request(), id, deps({ findProfile: async () => null, changeMembership: noWrite }))).status, 403);
  for (const method of ['POST', 'DELETE']) {
    const response = await handleMembership(request(method), id, deps());
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { joined: method === 'POST' });
    assert.match(response.headers.get('cache-control'), /private, no-store/);
  }
});

test('membership API rejects CSRF, submitted identities, unsupported methods and sanitizes errors', async () => {
  const noWrite = () => assert.fail('unsafe write');
  for (const headers of [{ origin: 'https://evil.test' }, { origin: '' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }]) {
    assert.equal((await handleMembership(request('POST', headers), id, deps({ changeMembership: noWrite }))).status, 403);
  }
  for (const body of [JSON.stringify({ profile_id: playerId }), 'x'.repeat(5000)]) assert.equal((await handleMembership(request('POST', {}, body), id, deps({ changeMembership: noWrite }))).status, 400);
  assert.equal((await handleMembership(request('PUT'), id, deps({ changeMembership: noWrite }))).status, 405);
  for (const status of [403, 404, 409]) assert.equal((await handleMembership(request(), id, deps({ changeMembership: async () => { throw new GameMembershipError('Expected error', status); } }))).status, status);
  assert.equal((await handleMembership(request(), id, deps({ changeMembership: async () => { throw new GameProfileError('Complete profile'); } }))).status, 403);
  const response = await handleMembership(request(), id, deps({ changeMembership: async () => { throw new Error('private SQL credentials'); } }));
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private SQL/);
});

function fakeDb(options = {}) {
  const { profile = { id: playerId, skill_level: 3 }, game = { id, host_id: id, starts_at: new Date('2099-07-01T12:00Z'), ends_at: new Date('2099-07-01T13:00Z'), status: 'scheduled', format: 'singles', skill_min: 2, skill_max: 4 }, member = false, count = 1, overlap = false, failWrite = false } = options;
  const calls = []; let released = false;
  return { calls, get released() { return released; }, connect: async () => ({ release() { released = true; }, query: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('FROM campus_pickleball.profiles')) return { rows: profile ? [profile] : [] };
    if (sql.includes('FROM campus_pickleball.sessions WHERE')) return { rows: game ? [game] : [] };
    if (sql === 'SELECT clock_timestamp() AS now') return { rows: [{ now: new Date('2026-10-24T12:00Z') }] };
    if (sql.includes('SELECT count(*)')) return { rows: [{ count }] };
    if (sql.includes('JOIN campus_pickleball.sessions')) return { rows: overlap ? [{}] : [] };
    if (sql.startsWith('SELECT 1 FROM campus_pickleball.session_members')) return { rows: member ? [{}] : [] };
    if (failWrite && /^(INSERT|DELETE)/.test(sql)) throw new Error('private SQL');
    return { rows: [] };
  } }) };
}

test('join locks profile before session, checks fresh DB time and capacity, commits session-derived membership', async () => {
  const db = fakeDb();
  assert.deepEqual(await changeMembership('trusted', id, true, db), { joined: true });
  assert.equal(db.calls[0].sql, 'BEGIN');
  assert.match(db.calls[1].sql, /profiles.*FOR UPDATE/); assert.deepEqual(db.calls[1].values, ['trusted']);
  assert.match(db.calls[2].sql, /sessions.*FOR UPDATE/s);
  assert.equal(db.calls[3].sql, 'SELECT clock_timestamp() AS now');
  assert.deepEqual(db.calls.find(({ sql }) => sql.startsWith('INSERT')).values, [id, playerId]);
  assert.equal(db.calls.at(-1).sql, 'COMMIT'); assert.ok(db.released);
});

test('join and leave retries are idempotent, including changed rating and a full roster', async () => {
  const db = fakeDb({ member: true, count: 2, profile: { id: playerId, skill_level: 5.5 } });
  await changeMembership('trusted', id, true, db);
  assert.ok(!db.calls.some(({ sql }) => sql.startsWith('INSERT')));
  const empty = fakeDb(); await changeMembership('trusted', id, false, empty);
  assert.ok(!empty.calls.some(({ sql }) => sql.startsWith('DELETE')));
  const member = fakeDb({ member: true }); await changeMembership('trusted', id, false, member);
  assert.deepEqual(member.calls.find(({ sql }) => sql.startsWith('DELETE')).values, [id, playerId]);
});

test('closed, full, ineligible, overlapping, missing and host-leave operations roll back', async () => {
  const normal = { id, host_id: id, starts_at: new Date('2099-07-01T12:00Z'), ends_at: new Date('2099-07-01T13:00Z'), status: 'scheduled', format: 'doubles', skill_min: 2, skill_max: 4 };
  const cases = [
    [{ profile: null }, true, GameProfileError], [{ game: null }, true, /not found/],
    [{ count: 2 }, true, /full/], [{ game: normal, count: 4 }, true, /full/],
    [{ profile: { id: playerId, skill_level: 5 } }, true, /skill/],
    [{ overlap: true }, true, /already have/],
    [{ game: { ...normal, status: 'cancelled' } }, true, /cancelled/],
    [{ game: { ...normal, starts_at: new Date('2026-10-24T12:00Z') } }, true, /started/],
    [{ game: { ...normal, starts_at: new Date('2026-10-24T12:00Z') }, member: true }, false, /started/],
    [{ profile: { id, skill_level: 3 }, member: true }, false, /Hosts cannot leave/],
    [{ failWrite: true }, true, /temporarily unavailable/],
  ];
  for (const [options, joining, error] of cases) {
    const db = fakeDb(options); await assert.rejects(changeMembership('trusted', id, joining, db), error);
    assert.equal(db.calls.at(-1).sql, 'ROLLBACK'); assert.ok(db.released);
    assert.ok(!db.calls.some(({ sql }) => sql === 'COMMIT'));
  }
  await assert.rejects(changeMembership('trusted', 'bad', true, { connect: () => assert.fail('query') }), /not found/);
});

test('filters validate dates, ratings, court IDs, duplicate parameters and pagination', () => {
  assert.deepEqual(parseGameFilters({}, '3'), { skill: '3', date: '', court: '', page: 1 });
  assert.equal(parseGameFilters({ skill: 'all' }, '3').skill, 'all');
  assert.equal(parseGameFilters({ date: '2028-02-29', court: id, page: '2' }).page, 2);
  for (const input of [{ skill: '2.25' }, { skill: ['3', '4'] }, { court: 'bad' }, { date: '2027-02-29' }, { date: '2026-13-01' }, { date: '2026-1-01' }, { page: '0' }, { page: '-1' }, { page: '1000000' }, { date: ['2026-01-01'] }]) assert.throws(() => parseGameFilters(input), GameInputError);
});

test('discovery uses parameterized court-local date, future status filters and stable pagination', async () => {
  const rows = Array.from({ length: 21 }, (_, i) => ({ id: i }));
  const result = await listGames(parseGameFilters({ skill: '3', date: '2099-07-01', court: id, page: '2' }), playerId, { query: async (sql, values) => {
    assert.match(sql, /s.status = 'scheduled' AND s.starts_at > statement_timestamp\(\)/);
    assert.match(sql, /AT TIME ZONE c.timezone/); assert.match(sql, /ORDER BY s.starts_at, s.id/);
    assert.deepEqual(values, [3, id, '2099-07-01', playerId, 20]); return { rows };
  } });
  assert.equal(result.games.length, 20); assert.equal(result.hasNext, true);
});
