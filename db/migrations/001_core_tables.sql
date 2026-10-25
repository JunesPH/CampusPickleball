-- Ordinary PostgreSQL tables only. The runner owns the isolated schema.
CREATE TABLE campus_pickleball.universities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  region text NOT NULL CHECK (btrim(region) <> '')
);

CREATE TABLE campus_pickleball.courts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id uuid NOT NULL REFERENCES campus_pickleball.universities(id),
  name text NOT NULL CHECK (btrim(name) <> ''),
  address text NOT NULL CHECK (btrim(address) <> ''),
  timezone text NOT NULL CHECK (btrim(timezone) <> '')
);

CREATE TABLE campus_pickleball.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject text NOT NULL UNIQUE CHECK (btrim(auth_subject) <> ''),
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  university_id uuid NOT NULL REFERENCES campus_pickleball.universities(id),
  skill_level smallint NOT NULL CHECK (skill_level BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campus_pickleball.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES campus_pickleball.profiles(id),
  court_id uuid NOT NULL REFERENCES campus_pickleball.courts(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  format text NOT NULL CHECK (format IN ('singles', 'doubles')),
  skill_min smallint NOT NULL CHECK (skill_min BETWEEN 1 AND 3),
  skill_max smallint NOT NULL CHECK (skill_max BETWEEN 1 AND 3),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  notes text CHECK (char_length(notes) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_skill_range CHECK (skill_min <= skill_max),
  CONSTRAINT sessions_duration CHECK (
    ends_at - starts_at BETWEEN interval '30 minutes' AND interval '180 minutes'
  ),
  CONSTRAINT sessions_finite_times CHECK (isfinite(starts_at) AND isfinite(ends_at))
);

CREATE TABLE campus_pickleball.session_members (
  session_id uuid NOT NULL REFERENCES campus_pickleball.sessions(id),
  profile_id uuid NOT NULL REFERENCES campus_pickleball.profiles(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, profile_id)
);

COMMENT ON TABLE campus_pickleball.courts IS
  'Curated venues associated with a campus for discovery; association does not imply ownership.';
COMMENT ON TABLE campus_pickleball.sessions IS
  'Player coordination only. A session does not reserve a physical court.';
COMMENT ON TABLE campus_pickleball.session_members IS
  'Participants including the host. Future membership writes must follow the specification locking protocol.';
