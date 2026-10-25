import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import nextEnv from '@next/env';
import { getPool } from '../src/lib/db.mjs';
import { saveProfile, listUniversities } from '../src/lib/profiles.mjs';
import { cancelGame, listMyGames, changeMembership, createGame, findGame, listCourts, listGames, parseGameFilters } from '../src/lib/games.mjs';

test('PostgreSQL discovery and membership rules, including real concurrent joins', { skip: process.env.RUN_GAME_DB_TESTS !== '1' }, async (t) => {
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const pool = getPool();
  const prefix = `test|membership-${randomUUID()}`;
  const profiles = [];
  let day = 1;
  try {
    const universities = await listUniversities(); const courts = await listCourts();
    assert.ok(universities.length && courts.length, 'Seed the database before running integration tests.');
    async function player(name, rating = 3) {
      const subject = `${prefix}-${name}`;
      const profile = await saveProfile(subject, { display_name: `Disposable ${name}`, university_id: universities[0].id, skill_level: rating });
      profiles.push(profile);
      return { ...profile, subject };
    }
    const host = await player('host'); const a = await player('a'); const b = await player('b'); const high = await player('high', 5.5);
    async function game(overrides = {}, owner = host) {
      return createGame(owner.subject, { court_id: courts[0].id, local_time: `2099-08-${String(day++).padStart(2, '0')}T23:30`, duration_minutes: 60, format: 'singles', skill_min: 2, skill_max: 4, ...overrides });
    }
    const count = async (id) => (await findGame(id)).participants.length;

    await t.test('two-player core flow: create, discover, join, My Games, leave/rejoin and host cancellation', async () => {
      const { id } = await game();
      const mine = async (player) => (await listMyGames(player.id)).games.find((g) => g.id === id);
      assert.equal((await mine(host)).host_id, host.id);
      assert.equal(await mine(a), undefined);
      assert.equal(await mine(b), undefined);
      const discovery = await listGames(parseGameFilters({ date: '2099-08-01', court: courts[0].id }), a.id);
      assert.ok(discovery.games.some((g) => g.id === id && !g.joined));
      await changeMembership(a.subject, id, true);
      assert.equal((await mine(a)).status, 'scheduled');
      assert.equal((await mine(a)).member_count, 2);
      await assert.rejects(cancelGame(a.subject, id), (error) => error.status === 403);
      assert.equal((await findGame(id)).status, 'scheduled');
      await changeMembership(a.subject, id, false);
      assert.equal(await mine(a), undefined);
      await changeMembership(a.subject, id, true);
      await cancelGame(host.subject, id);
      await cancelGame(host.subject, id); // Retrying the operation is safe.
      assert.equal((await mine(host)).status, 'cancelled');
      assert.equal((await mine(a)).status, 'cancelled');
      assert.equal((await findGame(id)).participants.length, 2);
      await assert.rejects(changeMembership(a.subject, id, true), /cancelled/);
      await assert.rejects(changeMembership(b.subject, id, true), /cancelled/);
      await assert.rejects(cancelGame(a.subject, id), (error) => error.status === 403);
      assert.ok(!(await listGames(parseGameFilters({ date: '2099-08-01', court: courts[0].id }), host.id)).games.some((g) => g.id === id));
      // Cancellation releases both players' overlapping commitments.
      await game({ local_time: '2099-08-01T23:30' });
      await game({ local_time: '2099-08-01T23:30' }, a);
    });

    await t.test('join racing cancellation leaves a cancelled game and never accepts later joins', async () => {
      const { id } = await game();
      const results = await Promise.allSettled([cancelGame(host.subject, id), changeMembership(a.subject, id, true)]);
      assert.equal(results[0].status, 'fulfilled');
      if (results[1].status === 'rejected') assert.match(results[1].reason.message, /cancelled/);
      assert.equal((await findGame(id)).status, 'cancelled');
      await assert.rejects(changeMembership(b.subject, id, true), /cancelled/);
    });

    await t.test('only one simultaneous request wins the last singles spot; retry stays unique; leave reopens it', async () => {
      const { id } = await game();
      const results = await Promise.allSettled([changeMembership(a.subject, id, true), changeMembership(b.subject, id, true)]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const rejected = results.find((result) => result.status === 'rejected'); assert.match(rejected.reason.message, /full/);
      assert.equal(await count(id), 2);
      const roster = (await findGame(id)).participants;
      const winner = roster.some((p) => p.id === a.id) ? a : b;
      const loser = winner === a ? b : a;
      await changeMembership(winner.subject, id, true); assert.equal(await count(id), 2);
      // A rating edit does not invalidate an existing membership or its retries.
      await pool.query('UPDATE campus_pickleball.profiles SET skill_level = 5.5 WHERE id = $1', [winner.id]);
      await changeMembership(winner.subject, id, true); assert.equal(await count(id), 2);
      await changeMembership(winner.subject, id, false); await changeMembership(winner.subject, id, false);
      assert.equal(await count(id), 1);
      await changeMembership(loser.subject, id, true); assert.equal(await count(id), 2);
      await pool.query('UPDATE campus_pickleball.profiles SET skill_level = 3 WHERE id = $1', [winner.id]);
      await assert.rejects(pool.query('INSERT INTO campus_pickleball.session_members (session_id, profile_id) VALUES ($1, $2)', [id, loser.id]), { code: '23505' });
    });

    await t.test('simultaneous duplicate joins use a single spot; doubles capacity includes the host', async () => {
      const { id } = await game({ format: 'doubles' });
      await Promise.all([changeMembership(a.subject, id, true), changeMembership(a.subject, id, true)]);
      assert.equal(await count(id), 2);
      await changeMembership(b.subject, id, true);
      const c = await player('c'); const d = await player('d');
      const results = await Promise.allSettled([changeMembership(c.subject, id, true), changeMembership(d.subject, id, true)]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(await count(id), 4);
    });

    await t.test('rating, missing game/profile, host leave, cancelled and started restrictions persist', async () => {
      const { id } = await game();
      await assert.rejects(changeMembership(high.subject, id, true), /skill/);
      await assert.rejects(changeMembership(`${prefix}-missing`, id, true), /profile/);
      await assert.rejects(changeMembership(a.subject, randomUUID(), true), /not found/);
      await assert.rejects(changeMembership(host.subject, id, false), /Hosts cannot leave/);
      await changeMembership(a.subject, id, true);
      await pool.query("UPDATE campus_pickleball.sessions SET status = 'cancelled' WHERE id = $1", [id]);
      await assert.rejects(changeMembership(b.subject, id, true), /cancelled/);
      await changeMembership(a.subject, id, false);
      await pool.query("UPDATE campus_pickleball.sessions SET status = 'scheduled', starts_at = clock_timestamp() - interval '1 minute', ends_at = clock_timestamp() + interval '59 minutes' WHERE id = $1", [id]);
      await assert.rejects(changeMembership(a.subject, id, true), /started/);
      await assert.rejects(changeMembership(a.subject, id, false), /started/);
      assert.equal(await count(id), 1);
      assert.ok(!(await listMyGames(host.id)).games.some((g) => g.id === id));
    });

    await t.test('one player cannot concurrently join overlapping games or host an overlapping commitment', async () => {
      const input = { local_time: '2099-09-01T12:00' };
      const first = await game(input); const second = await game(input, b);
      const results = await Promise.allSettled([changeMembership(a.subject, first.id, true), changeMembership(a.subject, second.id, true)]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.match(results.find((result) => result.status === 'rejected').reason.message, /already have/);
      await assert.rejects(game(input, a), /already have/);
      // Adjacent games are permitted: half-open intervals do not overlap.
      await game({ local_time: '2099-09-01T13:00' }, a);
    });

    await t.test('start time is checked after waiting for a lock, rather than at transaction start', async () => {
      const { id } = await game();
      const lock = await pool.connect();
      let pending;
      let signal;
      let joiningPid;
      const attemptingLock = new Promise((resolve) => { signal = resolve; });
      const waitingPool = { connect: async () => {
        const client = await pool.connect();
        joiningPid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        return { release: () => client.release(), query: (sql, values) => {
          const result = client.query(sql, values);
          if (sql.includes('FROM campus_pickleball.sessions WHERE')) signal();
          return result;
        } };
      } };
      try {
        await lock.query('BEGIN');
        await lock.query('SELECT id FROM campus_pickleball.sessions WHERE id = $1 FOR UPDATE', [id]);
        pending = changeMembership(a.subject, id, true, waitingPool);
        await attemptingLock;
        let waiting = false;
        for (let attempt = 0; attempt < 30; attempt++) {
          waiting = (await lock.query('SELECT 1 FROM pg_locks WHERE pid = $1 AND NOT granted', [joiningPid])).rowCount > 0;
          if (waiting) break;
          await setTimeout(20);
        }
        assert.ok(waiting, 'Join must actually wait for the session lock.');
        // The locking transaction changes the start while the join contends.
        await lock.query("UPDATE campus_pickleball.sessions SET starts_at = clock_timestamp() - interval '1 minute', ends_at = clock_timestamp() + interval '59 minutes' WHERE id = $1", [id]);
        await lock.query('COMMIT');
        await assert.rejects(pending, /started/);
      } finally { await lock.query('ROLLBACK'); lock.release(); await pending?.catch(() => {}); }
      assert.equal(await count(id), 1);
    });

    await t.test('discovery filters court-local dates, skill and court, excludes closed games and orders starts', async () => {
      const wanted = await game({ local_time: '2099-10-01T23:30' });
      const cancelled = await game({ local_time: '2099-10-01T20:00' }, b);
      await pool.query("UPDATE campus_pickleball.sessions SET status = 'cancelled' WHERE id = $1", [cancelled.id]);
      const result = await listGames(parseGameFilters({ date: '2099-10-01', skill: '3', court: courts[0].id }), host.id);
      assert.ok(result.games.some((g) => g.id === wanted.id && g.joined && g.member_count === 1));
      assert.ok(!result.games.some((g) => g.id === cancelled.id));
      for (let i = 1; i < result.games.length; i++) assert.ok(result.games[i - 1].starts_at <= result.games[i].starts_at);
      const ineligible = await listGames(parseGameFilters({ date: '2099-10-01', skill: '5.5', court: courts[0].id }));
      assert.ok(!ineligible.games.some((g) => g.id === wanted.id));
      const nextDate = await listGames(parseGameFilters({ date: '2099-10-02', court: courts[0].id }));
      assert.ok(!nextDate.games.some((g) => g.id === wanted.id));
      const otherCourt = await listGames(parseGameFilters({ court: randomUUID() })); assert.equal(otherCourt.games.length, 0);
      const all = await listGames(parseGameFilters({}));
      assert.ok(all.games.every((g) => g.starts_at > new Date()));
    });
  } catch { throw new Error('Membership integration check failed; check connectivity/schema and assertions locally.'); }
  finally {
    try {
      const ids = profiles.map((profile) => profile.id);
      if (ids.length) {
        await pool.query('DELETE FROM campus_pickleball.session_members WHERE profile_id = ANY($1::uuid[]) OR session_id IN (SELECT id FROM campus_pickleball.sessions WHERE host_id = ANY($1::uuid[]))', [ids]);
        await pool.query('DELETE FROM campus_pickleball.sessions WHERE host_id = ANY($1::uuid[])', [ids]);
        await pool.query('DELETE FROM campus_pickleball.profiles WHERE id = ANY($1::uuid[])', [ids]);
      }
    } catch { throw new Error('Disposable membership cleanup failed; inspect test|membership- identities locally.'); }
    finally { await pool.end(); }
  }
});
