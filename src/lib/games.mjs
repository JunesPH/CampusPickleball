import 'server-only';
import { getPool } from './db.mjs';
import { SKILL_LEVELS } from './skill-levels.mjs';

export class GameInputError extends Error {}
export class GameProfileError extends Error {}
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
    const profile = (await client.query('SELECT id, skill_level FROM campus_pickleball.profiles WHERE auth_subject = $1 FOR SHARE', [subject])).rows[0];
    if (!profile) throw new GameProfileError('Complete your profile before creating a game.');
    if (profile.skill_level < input.skill_min || profile.skill_level > input.skill_max) throw new GameInputError('The accepted skill range must include your own skill level.');
    const court = (await client.query('SELECT id, timezone FROM campus_pickleball.courts WHERE id = $1 FOR SHARE', [input.court_id])).rows[0];
    if (!court) throw new GameInputError('Choose an existing court.');
    const starts = courtTimeToDate(input.local_time, court.timezone);
    const ends = new Date(starts.getTime() + input.duration_minutes * 60000);
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
    const game = (await db.query(`SELECT s.id, s.starts_at, s.ends_at, s.format, s.skill_min, s.skill_max, s.host_id,
      c.name AS court_name, c.address, c.timezone, p.display_name AS host_name,
      COALESCE((SELECT json_agg(json_build_object('id', m.profile_id, 'display_name', mp.display_name) ORDER BY m.joined_at, m.profile_id)
        FROM campus_pickleball.session_members m JOIN campus_pickleball.profiles mp ON mp.id = m.profile_id WHERE m.session_id = s.id), '[]'::json) AS participants
      FROM campus_pickleball.sessions s JOIN campus_pickleball.courts c ON c.id = s.court_id
      JOIN campus_pickleball.profiles p ON p.id = s.host_id WHERE s.id = $1`, [id])).rows[0];
    return game ?? null;
  } catch { throw new Error('Game details are temporarily unavailable.'); }
}
