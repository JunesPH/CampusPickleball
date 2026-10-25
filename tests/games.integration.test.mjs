import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import nextEnv from '@next/env';
import { getPool } from '../src/lib/db.mjs';
import { saveProfile, listUniversities } from '../src/lib/profiles.mjs';
import { createGame, listCourts, findGame, GameInputError, GameProfileError } from '../src/lib/games.mjs';

test('PostgreSQL persists game and host together and rolls back a failed membership', { skip: process.env.RUN_GAME_DB_TESTS !== '1' }, async () => {
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const pool = getPool(); const subject = `test|campus-game-${randomUUID()}`;
  let profile;
  try {
    const universities = await listUniversities(); const courts = await listCourts();
    assert.ok(courts.length && universities.length);
    profile = await saveProfile(subject, { display_name: 'Disposable game host', university_id: universities[0].id, skill_level: 3 });
    const input = { court_id: courts[0].id, local_time: '2099-07-01T12:30', duration_minutes: 60, format: 'doubles', skill_min: 2, skill_max: 5.5 };
    const created = await createGame(subject, input); const game = await findGame(created.id);
    assert.equal(game.court_name, courts[0].name); assert.equal(game.timezone, courts[0].timezone);
    assert.equal(game.host_id, profile.id); assert.equal(game.format, input.format);
    assert.equal(game.skill_min, 2); assert.equal(game.skill_max, 5.5);
    assert.equal(game.starts_at.toISOString(), '2099-07-01T16:30:00.000Z');
    assert.deepEqual(game.participants, [{ id: profile.id, display_name: profile.display_name }]);
    await assert.rejects(createGame('test|missing-profile', input), GameProfileError);
    await assert.rejects(createGame(subject, { ...input, court_id: randomUUID() }), GameInputError);
    // Fail the membership with a real PostgreSQL FK error on the same client.
    const failingPool = { connect: async () => {
      const client = await pool.connect();
      return { release: () => client.release(), query: (sql, values) => client.query(sql, sql.startsWith('INSERT INTO campus_pickleball.session_members') ? [values[0], randomUUID()] : values) };
    } };
    await assert.rejects(createGame(subject, { ...input, local_time: '2099-07-02T12:30' }, failingPool), /temporarily unavailable/);
    const count = await pool.query('SELECT count(*)::int AS n FROM campus_pickleball.sessions WHERE host_id = $1', [profile.id]);
    assert.equal(count.rows[0].n, 1);
  } catch { throw new Error('Game integration check failed; check connectivity/schema and assertions locally.'); }
  finally {
    try {
      if (profile) {
        await pool.query('DELETE FROM campus_pickleball.session_members WHERE session_id IN (SELECT id FROM campus_pickleball.sessions WHERE host_id = $1)', [profile.id]);
        await pool.query('DELETE FROM campus_pickleball.sessions WHERE host_id = $1', [profile.id]);
      }
      await pool.query('DELETE FROM campus_pickleball.profiles WHERE auth_subject = $1', [subject]);
    } catch { throw new Error('Disposable game cleanup failed; inspect test|campus-game- identities locally.'); }
    finally { await pool.end(); }
  }
});
