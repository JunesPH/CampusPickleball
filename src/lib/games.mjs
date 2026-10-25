import 'server-only';
import { getPool } from './db.mjs';
import { SKILL_LEVELS } from './skill-levels.mjs';

export class GameInputError extends Error {}
export class GameProfileError extends Error {}
export class GameMembershipError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}
export const isUUID = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function validateGame(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['court_id', 'local_time', 'duration_minutes', 'format', 'skill_min', 'skill_max'].includes(key))) throw new GameInputError('Submit only the game fields shown in this form.');
  if (!isUUID(input.court_id)) throw new GameInputError('Choose an existing court.');
  if (!['singles', 'doubles'].includes(input.format)) throw new GameInputError('Choose singles or doubles.');
  if (!SKILL_LEVELS.includes(input.skill_min) || !SKILL_LEVELS.includes(input.skill_max) || input.skill_min > input.skill_max) throw new GameInputError('Choose skill levels from 2.0 to 5.5+, with minimum no higher than maximum.');
  if (!Number.isInteger(input.duration_minutes) || input.duration_minutes < 30 || input.duration_minutes > 180) throw new GameInputError('Choose a duration from 30 to 180 minutes.');
  if (typeof input.local_time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.local_time)) throw new GameInputError('Enter a valid date and time at the court.');
  return input;
}

// Resolve wall-clock input in the stored court timezone, independent of the
// browser/server timezone. Require exactly one instant across DST transitions.
export function courtTimeToDate(local, timezone, now = Date.now()) {
  const naive = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0, 16) !== local) throw new GameInputError('Enter a valid calendar date and time.');
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const wall = (instant) => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  };
  const offsets = new Set([-36, -12, 0, 12, 36].map((hours) => {
    const sample = naive + hours * 3600000;
    return Date.parse(`${wall(sample)}:00Z`) - sample;
  }));
  const matches = [...offsets].map((offset) => naive - offset).filter((instant) => wall(instant) === local);
  if (matches.length !== 1) throw new GameInputError('This court time is skipped or repeated by daylight saving. Choose another time.');
  if (matches[0] <= now) throw new GameInputError('Choose a future date and time at the court.');
  return new Date(matches[0]);
}

export async function listCourts(db = getPool()) {
  try {
    return (await db.query('SELECT id, name, address, timezone FROM campus_pickleball.courts ORDER BY name, id')).rows;
  } catch { throw new Error('Courts are temporarily unavailable.'); }
}

export async function createGame(subject, input, db = getPool()) {
  validateGame(input);
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const profile = (await client.query('SELECT id, skill_level FROM campus_pickleball.profiles WHERE auth_subject = $1 FOR UPDATE', [subject])).rows[0];
    if (!profile) throw new GameProfileError('Complete your profile before creating a game.');
    if (profile.skill_level < input.skill_min || profile.skill_level > input.skill_max) throw new GameInputError('The accepted skill range must include your own skill level.');
    const court = (await client.query('SELECT id, timezone FROM campus_pickleball.courts WHERE id = $1 FOR SHARE', [input.court_id])).rows[0];
    if (!court) throw new GameInputError('Choose an existing court.');
    const starts = courtTimeToDate(input.local_time, court.timezone);
    const ends = new Date(starts.getTime() + input.duration_minutes * 60000);
    if (await hasOverlap(client, profile.id, starts, ends)) throw new GameInputError('You already have a game during this time.');
    const game = (await client.query(`INSERT INTO campus_pickleball.sessions (host_id, court_id, starts_at, ends_at, format, skill_min, skill_max)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [profile.id, court.id, starts, ends, input.format, input.skill_min, input.skill_max])).rows[0];
    await client.query('INSERT INTO campus_pickleball.session_members (session_id, profile_id) VALUES ($1, $2)', [game.id, profile.id]);
    await client.query('COMMIT');
    return game;
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch { /* Preserve sanitized error. */ } }
    if (error instanceof GameInputError || error instanceof GameProfileError) throw error;
    throw new Error('Games are temporarily unavailable. Please try again.');
  } finally { client?.release(); }
}

export async function findGame(id, db = getPool()) {
  if (!isUUID(id)) return null;
  try {
    const game = (await db.query(`SELECT s.id, s.starts_at, s.ends_at, s.format, s.skill_min, s.skill_max, s.host_id, s.status,
      c.name AS court_name, c.address, c.timezone, p.display_name AS host_name,
      COALESCE((SELECT json_agg(json_build_object('id', m.profile_id, 'display_name', mp.display_name) ORDER BY m.joined_at, m.profile_id)
        FROM campus_pickleball.session_members m JOIN campus_pickleball.profiles mp ON mp.id = m.profile_id WHERE m.session_id = s.id), '[]'::json) AS participants
      FROM campus_pickleball.sessions s JOIN campus_pickleball.courts c ON c.id = s.court_id
      JOIN campus_pickleball.profiles p ON p.id = s.host_id WHERE s.id = $1`, [id])).rows[0];
    return game ?? null;
  } catch { throw new Error('Game details are temporarily unavailable.'); }
}

// Profile locks serialize one player's commitments; session locks serialize
// capacity changes. Every create/join/leave uses that same lock order.
async function hasOverlap(client, profileId, starts, ends) {
  return (await client.query(`SELECT 1 FROM campus_pickleball.session_members m
    JOIN campus_pickleball.sessions s ON s.id = m.session_id
    WHERE m.profile_id = $1 AND s.status = 'scheduled'
      AND s.starts_at < $3 AND s.ends_at > $2 LIMIT 1`, [profileId, starts, ends])).rows.length > 0;
}

export async function changeMembership(subject, id, joining, db = getPool()) {
  if (!isUUID(id)) throw new GameMembershipError('Game not found.', 404);
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const profile = (await client.query('SELECT id, skill_level FROM campus_pickleball.profiles WHERE auth_subject = $1 FOR UPDATE', [subject])).rows[0];
    if (!profile) throw new GameProfileError('Complete your profile before joining or leaving a game.');
    const game = (await client.query(`SELECT id, host_id, starts_at, ends_at, status, format, skill_min, skill_max
      FROM campus_pickleball.sessions WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!game) throw new GameMembershipError('Game not found.', 404);
    // Read the database clock AFTER acquiring both locks: a request may have
    // waited past the start time. Transaction-start now() would be stale.
    const { now } = (await client.query('SELECT clock_timestamp() AS now')).rows[0];
    if (game.starts_at <= now) throw new GameMembershipError('This game has started. Joining and leaving are closed.');
    if (!joining && game.host_id === profile.id) throw new GameMembershipError('Hosts cannot leave their own game. Cancel the game instead.', 403);
    if (joining && game.status !== 'scheduled') throw new GameMembershipError('This game has been cancelled.');
    const member = (await client.query('SELECT 1 FROM campus_pickleball.session_members WHERE session_id = $1 AND profile_id = $2', [id, profile.id])).rows.length > 0;
    // Retries do not consume another spot or recheck a member's changed rating.
    if (joining && !member) {
      if (profile.skill_level < game.skill_min || profile.skill_level > game.skill_max) throw new GameMembershipError('Your skill level is outside this game’s accepted range.', 403);
      const { count } = (await client.query('SELECT count(*)::int AS count FROM campus_pickleball.session_members WHERE session_id = $1', [id])).rows[0];
      if (count >= (game.format === 'singles' ? 2 : 4)) throw new GameMembershipError('This game is full. Choose another game or try again if a spot opens.');
      if (await hasOverlap(client, profile.id, game.starts_at, game.ends_at)) throw new GameMembershipError('You already have a game during this time.');
      await client.query('INSERT INTO campus_pickleball.session_members (session_id, profile_id) VALUES ($1, $2)', [id, profile.id]);
    } else if (!joining && member) {
      await client.query('DELETE FROM campus_pickleball.session_members WHERE session_id = $1 AND profile_id = $2', [id, profile.id]);
    }
    await client.query('COMMIT');
    return { joined: joining };
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch { /* Preserve sanitized error. */ } }
    if (error instanceof GameMembershipError || error instanceof GameProfileError) throw error;
    throw new Error('Games are temporarily unavailable. Please try again.');
  } finally { client?.release(); }
}

export function parseGameFilters(input, defaultSkill = 'all') {
  const read = (key, fallback = '') => {
    const value = input[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'string') throw new GameInputError('Choose one value for each filter.');
    return value;
  };
  const skill = read('skill', defaultSkill) || 'all';
  const court = read('court');
  const date = read('date');
  const page = read('page', '1');
  if (skill !== 'all' && !SKILL_LEVELS.includes(Number(skill))) throw new GameInputError('Choose a skill level from the list.');
  if (court && !isUUID(court)) throw new GameInputError('Choose a court from the list.');
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date)) throw new GameInputError('Choose a valid calendar date.');
  if (!/^[1-9]\d{0,5}$/.test(page)) throw new GameInputError('Choose a valid results page.');
  return { skill, court, date, page: Number(page) };
}

export async function listGames(filters, profileId = null, db = getPool()) {
  try {
    const result = await db.query(`SELECT s.id, s.starts_at, s.ends_at, s.format, s.skill_min, s.skill_max, s.host_id,
      c.name AS court_name, c.address, c.timezone,
      (SELECT count(*)::int FROM campus_pickleball.session_members m WHERE m.session_id = s.id) AS member_count,
      EXISTS (SELECT 1 FROM campus_pickleball.session_members m WHERE m.session_id = s.id AND m.profile_id = $4::uuid) AS joined
      FROM campus_pickleball.sessions s JOIN campus_pickleball.courts c ON c.id = s.court_id
      WHERE s.status = 'scheduled' AND s.starts_at > statement_timestamp()
        AND ($1::double precision IS NULL OR (s.skill_min <= $1 AND s.skill_max >= $1))
        AND ($2::uuid IS NULL OR s.court_id = $2)
        AND ($3::date IS NULL OR (s.starts_at AT TIME ZONE c.timezone)::date = $3)
      ORDER BY s.starts_at, s.id LIMIT 21 OFFSET $5`,
    [filters.skill === 'all' ? null : Number(filters.skill), filters.court || null, filters.date || null, profileId, (filters.page - 1) * 20]);
    return { games: result.rows.slice(0, 20), hasNext: result.rows.length > 20 };
  } catch { throw new Error('Game discovery is temporarily unavailable.'); }
}

// Keep memberships as the cancellation roster so players can still find the
// cancellation. Scheduled-only overlap checks automatically release their time.
export async function cancelGame(subject, id, db = getPool()) {
  if (!isUUID(id)) throw new GameMembershipError('Game not found.', 404);
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const profile = (await client.query('SELECT id FROM campus_pickleball.profiles WHERE auth_subject = $1 FOR UPDATE', [subject])).rows[0];
    if (!profile) throw new GameProfileError('Complete your profile before cancelling a game.');
    const game = (await client.query('SELECT host_id, starts_at, status FROM campus_pickleball.sessions WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!game) throw new GameMembershipError('Game not found.', 404);
    if (game.host_id !== profile.id) throw new GameMembershipError('Only the host can cancel this game.', 403);
    if (game.status !== 'cancelled') {
      const { now } = (await client.query('SELECT clock_timestamp() AS now')).rows[0];
      if (game.starts_at <= now) throw new GameMembershipError('This game has started and can no longer be cancelled.');
      await client.query("UPDATE campus_pickleball.sessions SET status = 'cancelled' WHERE id = $1", [id]);
    }
    await client.query('COMMIT');
    return { status: 'cancelled' };
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch { /* Preserve sanitized error. */ } }
    if (error instanceof GameMembershipError || error instanceof GameProfileError) throw error;
    throw new Error('Games are temporarily unavailable. Please try again.');
  } finally { client?.release(); }
}

export async function listMyGames(profileId, page = 1, db = getPool()) {
  if (!isUUID(profileId) || !Number.isInteger(page) || page < 1 || page > 999999) throw new GameInputError('Choose a valid results page.');
  try {
    const result = await db.query(`SELECT s.id, s.starts_at, s.ends_at, s.format, s.status, s.host_id,
      c.name AS court_name, c.timezone,
      (SELECT count(*)::int FROM campus_pickleball.session_members m WHERE m.session_id = s.id) AS member_count
      FROM campus_pickleball.sessions s JOIN campus_pickleball.courts c ON c.id = s.court_id
      WHERE s.starts_at > statement_timestamp() AND (s.host_id = $1 OR EXISTS (
        SELECT 1 FROM campus_pickleball.session_members m WHERE m.session_id = s.id AND m.profile_id = $1))
      ORDER BY s.starts_at, s.id LIMIT 21 OFFSET $2`, [profileId, (page - 1) * 20]);
    return { games: result.rows.slice(0, 20), hasNext: result.rows.length > 20 };
  } catch { throw new Error('Your games are temporarily unavailable. Please try again.'); }
}
