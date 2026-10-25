# Homepage release — October 25, 2026

URL: https://campuspickleball.us

Release: `/srv/campus-pickleball/releases/20261025-03-home`

Source: repository commit `004098054d112c633c8e625e9eb60949773911ca`
plus the homepage, shared shell, smoke check, regression tests, and deployment
notes in this working tree. No commit was created by the deployment task.

Deployed and verified over public HTTPS. Browser-based visual and real-user
authentication checks remain pending as detailed below.

## Changes

- Both session states see the overview at `/`; the homepage no longer redirects
  signed-in students to `/profile`.
- The shared Campus Pickleball brand always links to `/`. Signed-out visitors
  can browse games or sign in. Signed-in visitors can find or create games, and
  still reach My Games, My profile, and logout from the existing navigation.
- Existing profile checks on protected pages still route incomplete profiles
  through `/profile/setup`. The homepage itself does not require a database
  lookup or completed profile.
- A responsive court, paddles, and perforated ball SVG accompanies concise
  student-focused copy, the three steps, and a closing invitation. Skills are
  explicitly self-reported; the page explains that a game does not reserve a court.
- Scoped CSS preserves the slate/lime palette and existing page layouts. No
  animation is used. No database, Auth0, credential, or proxy changes were made.

## Local verification

- `npm run lint` and `npm run build` passed. The previously documented Auth0
  DPoP dynamic-import warning remains; it does not fail the build.
- All 48 offline tests passed: 6 new homepage/navigation/profile-gate tests,
  9 existing game UI tests, and 33 existing database/profile/game unit tests.
  Session states in these tests are injected; they are not real Auth0 sessions.
- Production HTTP checks on `127.0.0.1:3100` passed for the homepage, brand link,
  four semantic sections, private/no-store caching, linked CSS/JavaScript assets,
  and anonymous redirects from profile, profile setup, new game, and My Games.
  The temporary local production server was stopped afterward.
- Text color calculations passed WCAG AA (normal text); the sampled muted hero
  text is 6.96:1 and primary button text is 13.67:1. Source checks confirmed one
  h1, labelled sections, an ordered step list, decorative SVG hidden from assistive
  technology, 48px minimum CTA height, 44px navigation targets, a skip link, and
  visible keyboard focus styles. Actual keyboard traversal was not tested.
- `git diff --check` passed.

## Responsive review limits

No browser surface was available: the computer-use inventory was empty, and both
in-app browser and Chrome creation returned "Browser is not available". JSDOM
does not perform layout. The following is CSS/source review, not rendered visual
or measured overflow verification:

| Width | Intended behavior checked in source | Rendered check |
| --- | --- | --- |
| 320px | Single column; full-width stacked hero CTAs; artwork fits its grid cell; navigation wraps | Unverified |
| 390px | Single column; CTA row wraps if needed; artwork capped at 350px and 100% of available width | Unverified |
| 1280px | Two-column hero; three-column steps; closing CTA beside text; page capped at 1152px | Unverified |

Grid columns use `minmax(0, …)`, artwork scales within its container, and the
shared main retains text wrapping. A real browser still needs to confirm actual
overflow, artwork placement, button usability, focus traversal, and zoom behavior.
Real login/callback/logout and authenticated navigation, including an account
without a completed profile, also remain unverified in a browser.

## Deployment and rollback

The first staged upload (`20261025-02-home`) failed lint because macOS archive
metadata produced `._*` files on Linux. It never activated. A fresh source archive
was made with `COPYFILE_DISABLE=1` and `tar --no-xattrs --no-acls --no-fflags`;
its contents were checked to exclude metadata, secrets, dependencies, and builds.
SHA-256 was verified after transfer. The normal `deploy/release.sh` workflow is
used for the corrected release, including Linux locked dependency installation,
lint, production build, and read-only Tiger Data checks; no migrations or seeds.

The rollback target is `/srv/campus-pickleball/releases/20261025-01`. Keep that
release and use the atomic symlink/restart procedure in [README.md](README.md).
Do not rebuild the running release or change the shared production environment.

Final live verification passed:

- The normal release workflow completed Linux dependency installation, lint,
  production build, `db:check`, and `db:verify` before switching `current`.
  Tiger Data confirmed a read-only transaction over TLS 1.3 and valid migration
  history/schema. Counts at verification: 1 university, 5 courts, 3 profiles,
  2 games, and 3 memberships. This task made no database writes.
- Public deployment smoke checks passed: new overview and anonymous CTAs,
  private/no-store caching, brand home link, trusted TLS, HTTP-to-HTTPS redirect,
  Auth0 callback destination and Secure/HttpOnly transaction cookies, anonymous
  mutation denials, blocked SDK token/profile endpoints, game discovery/filters,
  protected game routes, and missing game handling.
- Additional live checks confirmed all 9 linked CSS/JavaScript assets return
  HTTP 200, the discovery header links to `/`, profile/setup pages require login
  (including Next.js streamed redirects), and `www` redirects to canonical HTTPS.
- All 6 homepage/session/profile-gate regression tests passed on Vultr. These
  are injected-session tests, not real browser authentication.
- All 39 browser assets were scanned for the production database URL, Auth0
  client secret, and cookie secret; no matching secret values were found.
- Caddy and the app are active and enabled at boot. `current` points to
  `20261025-03-home`; `previous` points to `20261025-01`, whose production build
  remains available. No additional restart, OS reboot, or rollback was performed.

Recovery source archive:
`/srv/campus-pickleball/artifacts/20261025-03-home-source.tar.gz`

SHA-256: `8851c60feb0ab433cc3569a14ce96671d2ad40f495d9b00a82ff84b28c06f64d`

The matching checksum file is `20261025-03-home-source.sha256` in the same
directory. The archive contains the exact staged source before these verification
notes were updated; the final deployment notes are also copied to the release
and artifact directories. Private environment files are excluded.
