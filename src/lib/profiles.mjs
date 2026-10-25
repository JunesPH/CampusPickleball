import "server-only";
import { getPool } from "./db.mjs";

export class ProfileInputError extends Error {}

export function validateProfile(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ProfileInputError("Enter a display name, university, and skill level.");
  }
  const { display_name, university_id, skill_level } = input;
  if (Object.keys(input).some((key) => !["display_name", "university_id", "skill_level"].includes(key))) {
    throw new ProfileInputError("Only profile fields may be submitted.");
  }
  if (typeof display_name !== "string" || [...display_name.trim()].length < 1 || [...display_name.trim()].length > 80) {
    throw new ProfileInputError("Display name must contain 1–80 characters.");
  }
  if (typeof university_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(university_id)) {
    throw new ProfileInputError("Choose a university from the list.");
  }
  if (typeof skill_level !== "number" || !Number.isInteger(skill_level * 2) || skill_level < 2 || skill_level > 5.5) {
    throw new ProfileInputError("Choose a skill level from 2.0 to 5.5+ in 0.5 steps.");
  }
  return { display_name: display_name.trim(), university_id, skill_level };
}

// Explicit column lists keep Auth0 identity and credentials off the wire.
const publicColumns = "id, display_name, university_id, skill_level, created_at, updated_at";

async function profileQuery(db, sql, values = []) {
  try {
    return await db.query(sql, values);
  } catch {
    // Server Components also call these operations. Sanitize before Next.js can
    // log a pg exception containing private hostnames or query parameters.
    throw new Error("Player data is temporarily unavailable.");
  }
}

export async function findProfile(subject, db = getPool()) {
  const result = await profileQuery(db,
    `SELECT ${publicColumns} FROM campus_pickleball.profiles WHERE auth_subject = $1`,
    [subject],
  );
  return result.rows[0] ?? null;
}

export async function listUniversities(db = getPool()) {
  const result = await profileQuery(db, "SELECT id, name FROM campus_pickleball.universities ORDER BY name, id");
  return result.rows;
}

export async function saveProfile(subject, input, db = getPool()) {
  const value = validateProfile(input);
  // One atomic statement: the unique auth_subject constraint serializes racing
  // first saves. INSERT…SELECT also checks the selected university exists.
  const result = await profileQuery(db,
    `INSERT INTO campus_pickleball.profiles (auth_subject, display_name, university_id, skill_level)
     SELECT $1, $2, id, $4 FROM campus_pickleball.universities WHERE id = $3::uuid
     ON CONFLICT (auth_subject) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       university_id = EXCLUDED.university_id,
       skill_level = EXCLUDED.skill_level,
       updated_at = clock_timestamp()
     RETURNING ${publicColumns}`,
    [subject, value.display_name, value.university_id, value.skill_level],
  );
  if (!result.rows[0]) throw new ProfileInputError("Choose a university from the list.");
  return result.rows[0];
}
