-- Replace the original 1/2/3 categories with self-reported ratings.
-- double precision keeps pg results numeric; half-point values are exact.
ALTER TABLE campus_pickleball.profiles DROP CONSTRAINT profiles_skill_level_check;
ALTER TABLE campus_pickleball.profiles
  ALTER COLUMN skill_level TYPE double precision USING (skill_level + 1)::double precision;
ALTER TABLE campus_pickleball.profiles ADD CONSTRAINT profiles_skill_level_check
  CHECK (skill_level IN (2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5));

-- Keep existing session eligibility ranges on the same scale as profiles.
ALTER TABLE campus_pickleball.sessions
  DROP CONSTRAINT sessions_skill_min_check,
  DROP CONSTRAINT sessions_skill_max_check;
ALTER TABLE campus_pickleball.sessions
  ALTER COLUMN skill_min TYPE double precision USING (skill_min + 1)::double precision,
  ALTER COLUMN skill_max TYPE double precision USING (skill_max + 1)::double precision;
ALTER TABLE campus_pickleball.sessions
  ADD CONSTRAINT sessions_skill_min_check CHECK (skill_min IN (2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5)),
  ADD CONSTRAINT sessions_skill_max_check CHECK (skill_max IN (2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5));
