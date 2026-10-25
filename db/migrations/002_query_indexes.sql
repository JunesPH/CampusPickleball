-- Index referencing columns: PostgreSQL only indexes FK targets automatically.
CREATE INDEX courts_university_idx ON campus_pickleball.courts (university_id);
CREATE INDEX profiles_university_idx ON campus_pickleball.profiles (university_id);
CREATE INDEX sessions_host_starts_idx ON campus_pickleball.sessions (host_id, starts_at);
CREATE INDEX sessions_court_starts_idx ON campus_pickleball.sessions (court_id, starts_at);
CREATE INDEX sessions_scheduled_starts_idx ON campus_pickleball.sessions (starts_at, id)
  WHERE status = 'scheduled';
-- The composite PK serves session rosters/counts; this serves My Games/overlap reads.
CREATE INDEX session_members_profile_idx ON campus_pickleball.session_members (profile_id, session_id);
