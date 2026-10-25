# Live deployment handoff — October 25, 2026

Application: https://campuspickleball.us

www redirects to the canonical domain. HTTP redirects to HTTPS. DNS remains
managed manually in Porkbun; no nameserver changes were made.

## Server and release

- Vultr public IPv4: 107.191.36.86
- SSH: `ssh -i ~/.ssh/id_ed25519 linuxuser@107.191.36.86`
- Ubuntu 26.04.1 LTS; Node 24.22.1; npm 11.19.1; Caddy 2.11.7
- Active release: /srv/campus-pickleball/releases/20261025-01
- Base repository commit: 8444edc, plus this task's deployment tooling and test fix
- Application service user: campus-pickleball (no interactive login)
- Runtime secrets: /etc/campus-pickleball/production.env, root:campus-pickleball 0640
- Proxy: /etc/caddy/Caddyfile; original preserved at Caddyfile.before-campus-pickleball
- App service: /etc/systemd/system/campus-pickleball.service
- Source recovery artifact: /srv/campus-pickleball/artifacts/20261025-01-source.tar.gz
- Artifact checksum: /srv/campus-pickleball/artifacts/20261025-01-source.sha256

This is the first production release, so no prior production release exists.
Retain this release and its source artifact. Subsequent release.sh deployments
retain the last successful release in `previous` for the rollback procedure in
README.md. Database migrations are not part of automated deployment.

## Verified on Vultr

- Locked Linux dependency installation, lint, production build, and read-only
  Tiger Data schema/seed checks passed. Existing Auth0 DPoP build warning remains.
- Tiger Data uses certificate-verified TLS 1.3. Its existing schema and records
  were preserved; no migration or seed command was run.
- All 18 live database integration tests passed from the server, including
  concurrent membership, rollback on SQL failure, identity isolation, saved
  profile changes, and cancellation persistence through public HTTPS reloads.
  Disposable fixtures were cleaned up. Final counts matched the pretest state:
  1 university, 5 courts, 2 profiles, 2 games, 3 memberships.
- Public smoke checks passed from the developer computer: valid HTTPS, canonical
  HTTP redirect, configured homepage, protected page redirects, anonymous writes
  denied, private caching, token/profile SDK endpoints blocked, discovery/filter
  rendering, and missing game pages. www HTTPS redirect was checked separately.
- Auth0 login redirects use https://campuspickleball.us/auth/callback; transaction
  cookies are Secure and HTTP-only. A cookie-aware HTTP preflight reached the
  Auth0 page titled "Log in | Campus Pickleball" with HTTP 200.
- All 38 browser assets were scanned for the production database URL, Auth0 client
  secret, and production cookie secret. No matching secret values were found.
- Both Caddy and the app are enabled at boot. A controlled SIGKILL of the app
  caused systemd to restart it automatically (NRestarts=1), and public HTTPS
  recovered. An operating-system reboot was not performed.
- Application port 3000 and Caddy admin port 2019 bind only to 127.0.0.1. UFW
  permits only SSH TCP 22 and public TCP 80/443. Public web traffic succeeded;
  no Vultr account/firewall API access was available for a separate account audit.
- The temporary local production credential file and remote credential upload
  were removed after installation. The original local .env.local was preserved.

## Operations

```sh
# From your computer
ssh -i ~/.ssh/id_ed25519 linuxuser@107.191.36.86

# On Vultr
sudo systemctl status campus-pickleball caddy --no-pager
sudo journalctl -u campus-pickleball -n 100 --no-pager
sudo journalctl -u caddy -n 100 --no-pager
sudo systemctl restart campus-pickleball
sudo -u campus-pickleball bash /srv/campus-pickleball/current/deploy/verify.sh
```

The verification script writes disposable database fixtures and cleans them up.
Review logs locally; do not post raw OAuth URLs, cookies, user data, or secrets.
Redeploy and rollback commands, DNS requirements, exact Auth0 settings, and
environment handling are documented in README.md. Keep the production cookie
secret stable across deployments, and back up the environment securely outside
the public source archive. Certificate renewal is managed by Caddy's service.

## Remaining owner verification

There is no connected browser or physical device available to the deployment
agent. HTTP checks and injected-session integration tests do not establish a
real user login. Confirm these exact entries were appended to the correct
existing Auth0 application, preserving localhost entries:

- Callback: https://campuspickleball.us/auth/callback
- Logout: https://campuspickleball.us
- Web origin: https://campuspickleball.us

Then test on two physical devices, preferably on Wi-Fi and cellular:

1. Sign in using a different account on each device; confirm independent profiles.
2. Create an identifiable test game on A; join/leave on B and refresh A to verify.
3. Cancel on A; refresh B and confirm the cancellation persists.
4. Sign out on A; protected pages require login while B remains signed in.
5. Sign back in on A, verify saved profile persistence, and check mobile layout.

Real login/callback/logout, actual browser-session isolation, and physical-device
acceptance remain pending until the owner reports the results.
