import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import nextEnv from '@next/env';
import { getPool } from '../src/lib/db.mjs';
import { saveProfile, findProfile, listUniversities } from '../src/lib/profiles.mjs';
import { cancelGame, changeMembership, createGame, findGame, listCourts, listGames, listMyGames, parseGameFilters } from '../src/lib/games.mjs';
import { handleCancellation } from '../src/lib/cancellation-handler.mjs';
import { handleMembership } from '../src/lib/membership-handler.mjs';

// Session identity is injected only into handlers in this test process. This is
// real PostgreSQL + API-handler integration, not a real Auth0/browser login test.
test('cancellation audit against PostgreSQL', { skip: process.env.RUN_GAME_DB_TESTS !== '1', timeout: 120000 }, async (t) => {
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const pool = getPool();
  const prefix = `test|cancellation-audit-${randomUUID()}`;
  const players = []; const sessions = [];
  const base = 'http://localhost:3000';
  let sequence = 1;
  try {
    const universities = await listUniversities(); const courts = await listCourts();
    assert.ok(universities.length && courts.length);
    async function player(name) {
      const subject = `${prefix}-${name}`;
      const profile = await saveProfile(subject, { display_name: `Audit ${name}`, university_id: universities[0].id, skill_level: 3 });
      const result = { ...profile, subject }; players.push(result); return result;
    }
    const host = await player('host'); const guest = await player('guest'); const outsider = await player('outsider');
    const input = (overrides = {}) => ({ court_id: courts[0].id, local_time: `2100-01-${String(sequence++).padStart(2, '0')}T18:00`, duration_minutes: 60, format: 'doubles', skill_min: 2, skill_max: 4, ...overrides });
    async function game(owner = host, fields = input()) {
      const result = await createGame(owner.subject, fields); sessions.push(result.id); return result;
    }
    const raw = async (id, db = pool) => (await db.query('SELECT id, host_id, starts_at, ends_at, status FROM campus_pickleball.sessions WHERE id = $1', [id])).rows[0];
    const roster = async (id) => (await pool.query('SELECT profile_id, joined_at FROM campus_pickleball.session_members WHERE session_id = $1 ORDER BY profile_id', [id])).rows;
    const request = (id, { origin = base, method = 'POST', headers = {}, body } = {}) => new Request(`${base}/api/games/${id}/cancel`, { method, headers: { origin, ...headers }, body });
    const deps = (subject, operation = cancelGame) => ({ getSubject: async () => subject, findProfile, cancelGame: operation, appBaseUrl: base });
    const cancel = (who, id, options) => handleCancellation(request(id, options), id, deps(who?.subject ?? null));
    const join = (who, id, method = 'POST') => handleMembership(new Request(`${base}/api/games/${id}/membership`, { method, headers: { origin: base } }), id, { getSubject: async () => who.subject, findProfile, changeMembership, appBaseUrl: base });

    await t.test('API cancellation commits on a different connection, retains roster and releases both schedules', async () => {
      const fields = input(); const { id } = await game(host, fields);
      const sentinel = await game(outsider, input());
      const unrelatedBefore = await findGame(sentinel.id);
      assert.equal((await join(guest, id)).status, 200);
      const before = await roster(id);
      assert.equal((await cancel(guest, id)).status, 403);
      assert.equal((await raw(id)).status, 'scheduled');
      const observer = await pool.connect();
      try {
        // Hold a separate connection before cancelling: this read cannot be
        // seeing uncommitted state on the cancellation transaction's client.
        assert.equal((await raw(id, observer)).status, 'scheduled');
        const responses = await Promise.all([cancel(host, id), cancel(host, id)]);
        for (const response of responses) { assert.equal(response.status, 200); assert.deepEqual(await response.json(), { status: 'cancelled' }); }
        assert.equal((await raw(id, observer)).status, 'cancelled');
        assert.deepEqual(await roster(id), before);
        for (const who of [host, guest]) {
          assert.equal((await findGame(id, observer)).status, 'cancelled');
          assert.equal((await listMyGames(who.id, 1, observer)).games.find((g) => g.id === id).status, 'cancelled');
          assert.equal((await findGame(id, observer)).participants.length, 2);
        }
      } finally { observer.release(); }
      if (process.env.AUDIT_HTTP_BASE_URL) {
        // Real HTTP reads exercise Next's page rendering against the persisted
        // fixture. These requests are public/anonymous, not account logins.
        const httpBase = process.env.AUDIT_HTTP_BASE_URL;
        for (let reload = 0; reload < 2; reload++) {
          const response = await fetch(`${httpBase}/games/${id}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
          assert.equal(response.status, 200);
          const html = await response.text();
          assert.match(html, /Cancelled by the host/); assert.match(html, /Audit host/); assert.match(html, /Audit guest/);
          assert.doesNotMatch(html, /Sign in to join|Game created\./);
        }
        const response = await fetch(`${httpBase}/games?skill=all&date=${fields.local_time.slice(0, 10)}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        assert.equal(response.status, 200); assert.ok(!(await response.text()).includes(`href="/games/${id}"`));
        t.diagnostic('Real anonymous HTTP reloads rendered the persisted cancellation and retained roster; discovery omitted the game link.');
      }
      for (const who of [guest, outsider]) assert.equal((await join(who, id)).status, 409);
      assert.equal((await cancel(guest, id)).status, 403);
      assert.ok(!(await listGames(parseGameFilters({ date: fields.local_time.slice(0, 10), court: courts[0].id }))).games.some((g) => g.id === id));
      // Both may host at the released time, then join another overlapping game.
      for (const who of [host, guest]) { const replacement = await game(who, fields); assert.equal((await cancel(who, replacement.id)).status, 200); }
      const replacement = await game(outsider, fields);
      for (const who of [host, guest]) assert.equal((await join(who, replacement.id)).status, 200);
      assert.deepEqual(await roster(id), before);
      assert.deepEqual(await findGame(sentinel.id), unrelatedBefore);
      t.diagnostic('Persistence evidence: independent SQL connection read scheduled → cancelled; roster unchanged; both players’ My Games/details reread cancelled; later joins returned 409.');
    });

    await t.test('authorization, invalid IDs, CSRF and forged bodies leave stored status unchanged', async () => {
      const { id } = await game(); const before = await raw(id); const members = await roster(id);
      assert.equal((await cancel(null, id)).status, 401);
      assert.equal((await handleCancellation(request(id), id, deps(`${prefix}-no-profile`))).status, 403);
      assert.equal((await cancel(guest, id)).status, 403);
      for (const invalid of ['invalid', randomUUID()]) assert.equal((await cancel(host, invalid)).status, 404);
      for (const options of [
        { origin: 'https://evil.test' }, { origin: '' }, { headers: { 'sec-fetch-site': 'same-site' } },
        { headers: { 'sec-fetch-site': 'cross-site' } },
      ]) assert.equal((await cancel(host, id, options)).status, 403);
      for (const body of ['{}', JSON.stringify({ host_id: host.id }), 'x'.repeat(5000)]) {
        // Reject submitted bytes; Next can provide an empty body stream for POST.
        const response = await cancel(host, id, { body }); assert.equal(response.status, 400);
      }
      assert.deepEqual(await raw(id), before); assert.deepEqual(await roster(id), members);
      assert.equal((await cancel(host, id, { body: '' })).status, 200);
      assert.equal((await raw(id)).status, 'cancelled');
      assert.deepEqual(await roster(id), members);
    });

    await t.test('a database error after UPDATE rolls back rather than returning false success', async () => {
      const { id } = await game(); const before = await raw(id); const members = await roster(id);
      let released = false; let updated = false;
      const failing = { connect: async () => {
        const client = await pool.connect();
        return { release() { released = true; client.release(); }, query: async (sql, values) => {
          const result = await client.query(sql, values);
          if (sql.startsWith('UPDATE campus_pickleball.sessions')) { updated = true; await client.query('SELECT 1 / 0'); }
          return result;
        } };
      } };
      const response = await handleCancellation(request(id), id, deps(host.subject, (subject, gameId) => cancelGame(subject, gameId, failing)));
      assert.equal(response.status, 503); assert.ok(updated && released);
      assert.doesNotMatch(await response.text(), /division|SELECT|credentials/);
      assert.deepEqual(await raw(id), before); assert.deepEqual(await roster(id), members);
    });

    await t.test('cancellation checks the clock after a real lock wait across the start time', async () => {
      const { id } = await game(); const lock = await pool.connect();
      let pending, pid, signal;
      const attempting = new Promise((resolve) => { signal = resolve; });
      const waiting = { connect: async () => {
        const client = await pool.connect(); pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        return { release: () => client.release(), query: (sql, values) => {
          const result = client.query(sql, values); if (sql.includes('FROM campus_pickleball.sessions WHERE')) signal(); return result;
        } };
      } };
      try {
        await lock.query('BEGIN'); await lock.query('SELECT id FROM campus_pickleball.sessions WHERE id = $1 FOR UPDATE', [id]);
        pending = cancelGame(host.subject, id, waiting);
        // Attach rejection handling immediately while we deliberately hold a lock.
        const outcome = pending.then(() => null, (error) => error);
        await attempting;
        let blocked = false;
        for (let i = 0; i < 30; i++) {
          blocked = (await lock.query('SELECT 1 FROM pg_locks WHERE pid = $1 AND NOT granted', [pid])).rowCount > 0;
          if (blocked) break; await setTimeout(20);
        }
        assert.ok(blocked, 'Cancellation must actually contend on the session lock');
        // The contender's transaction has already started. Set a start after
        // that instant, then cross it before releasing the session lock.
        await lock.query("UPDATE campus_pickleball.sessions SET starts_at = clock_timestamp() + interval '100 milliseconds', ends_at = clock_timestamp() + interval '60 minutes 100 milliseconds' WHERE id = $1", [id]);
        await lock.query('SELECT pg_sleep(0.15)'); await lock.query('COMMIT');
        const error = await outcome; assert.equal(error?.status, 409); assert.match(error.message, /started/);
        assert.equal((await raw(id)).status, 'scheduled');
        assert.equal((await cancel(host, id)).status, 409);
      } finally { await lock.query('ROLLBACK'); lock.release(); await pending?.catch(() => {}); }
    });

    await t.test('concurrent leave/cancel requests preserve cancellation and remove only the departing member', async () => {
      for (let round = 0; round < 3; round++) {
        const { id } = await game(); await changeMembership(guest.subject, id, true);
        const operations = round % 2 ? [join(guest, id, 'DELETE'), cancel(host, id)] : [cancel(host, id), join(guest, id, 'DELETE')];
        for (const response of await Promise.all(operations)) assert.equal(response.status, 200);
        assert.equal((await raw(id)).status, 'cancelled');
        assert.deepEqual((await roster(id)).map((m) => m.profile_id), [host.id]);
        assert.equal((await listMyGames(guest.id)).games.some((g) => g.id === id), false);
        assert.equal((await join(guest, id)).status, 409);
      }
    });

    await t.test('My Games paginates hosted/joined cancellations, excluding past and unrelated fixtures', async () => {
      const viewer = await player('pagination');
      const rows = (await pool.query(`INSERT INTO campus_pickleball.sessions (host_id, court_id, starts_at, ends_at, format, skill_min, skill_max, status)
        SELECT CASE WHEN n % 2 = 0 THEN $1::uuid ELSE $2::uuid END, $3::uuid,
          '2101-01-01T18:00:00Z'::timestamptz + n * interval '1 day', '2101-01-01T19:00:00Z'::timestamptz + n * interval '1 day',
          'doubles', 2, 4, CASE WHEN n % 3 = 0 THEN 'cancelled' ELSE 'scheduled' END
        FROM generate_series(1, 24) AS n RETURNING id, starts_at`, [viewer.id, outsider.id, courts[0].id])).rows;
      sessions.push(...rows.map((row) => row.id));
      await pool.query('INSERT INTO campus_pickleball.session_members (session_id, profile_id) SELECT unnest($1::uuid[]), $2::uuid', [rows.map((row) => row.id), viewer.id]);
      const past = await game(viewer, input());
      await pool.query("UPDATE campus_pickleball.sessions SET starts_at = clock_timestamp() - interval '1 hour', ends_at = clock_timestamp() WHERE id = $1", [past.id]);
      const unrelated = await game(outsider, input());
      const expected = rows.sort((a, b) => a.starts_at - b.starts_at).map((row) => row.id);
      const first = await listMyGames(viewer.id); const second = await listMyGames(viewer.id, 2); const empty = await listMyGames(viewer.id, 3);
      assert.equal(first.games.length, 20); assert.equal(first.hasNext, true);
      assert.equal(second.games.length, 4); assert.equal(second.hasNext, false); assert.deepEqual(empty, { games: [], hasNext: false });
      const all = [...first.games, ...second.games]; assert.deepEqual(all.map((g) => g.id), expected);
      assert.ok(all.some((g) => g.status === 'cancelled')); assert.ok(all.some((g) => g.host_id === viewer.id)); assert.ok(all.some((g) => g.host_id !== viewer.id));
      assert.ok(all.every((g) => g.id !== unrelated.id && g.id !== past.id));
    });
  } finally {
    try {
      if (sessions.length) {
        await pool.query('DELETE FROM campus_pickleball.session_members WHERE session_id = ANY($1::uuid[])', [sessions]);
        await pool.query('DELETE FROM campus_pickleball.sessions WHERE id = ANY($1::uuid[])', [sessions]);
      }
      const ids = players.map((p) => p.id);
      if (ids.length) await pool.query('DELETE FROM campus_pickleball.profiles WHERE id = ANY($1::uuid[])', [ids]);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM campus_pickleball.sessions WHERE id = ANY($1::uuid[])', [sessions])).rows[0].count, 0);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM campus_pickleball.profiles WHERE id = ANY($1::uuid[])', [ids])).rows[0].count, 0);
      t.diagnostic(`Cleanup confirmed: ${sessions.length} disposable games and ${players.length} profiles removed by exact IDs.`);
    } finally { await pool.end(); }
  }
});
