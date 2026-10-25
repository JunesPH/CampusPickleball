# Vultr deployment

Status: deployed at https://campuspickleball.us on Vultr 107.191.36.86,
Ubuntu 26.04.1 LTS. SSH uses linuxuser and the owner's ~/.ssh/id_ed25519 key.
The active release is /srv/campus-pickleball/releases/20261025-03-home, based on
repository revision 0040980 plus the homepage update. The previous release,
20261025-01, is retained for rollback. Node 24.22.1 and Caddy 2.11.7 are installed.
See HOMEPAGE.md for current verification and remaining browser checks, and
DEPLOYMENT.md for the initial server handoff. Inspect existing services before
adapting these procedures to another instance.

Local preparation verified October 25, 2026: production build and lint passed;
33 offline API/database tests and 9 UI tests passed. Live profile, game creation,
membership, and cancellation tests passed after correcting a stale integration
assertion that rejected zero-byte cancellation bodies (already accepted by the
handler and unit tests). Cancellation fixtures were confirmed removed by exact
IDs. Local production HTTP checks passed, including anonymous Auth0 redirects
and persisted cancellation page reloads. All 38 browser assets were scanned for
the configured database URL, Auth0 client secret, and cookie secret; none were
found. The existing Auth0 DPoP dynamic-import build warning remains. Subsequent
live Vultr verification is recorded in DEPLOYMENT.md. The temporary local
production server used for preparation was stopped.

## Runtime and configuration

Use Node.js 24 LTS and npm with the committed package-lock.json. The package
requires Node >=20.9.0. Build on the target Linux architecture using `npm ci
--include=dev` and `npm run build`; do not upload macOS node_modules or .next.
One process listens on 127.0.0.1:3000, behind Caddy on TCP 80/443. There are no
WebSockets or required application-local uploads. Data persists in Tiger Data;
Auth0 manages identity. The Next cache remains on the server's release disk.

Store configuration at `/etc/campus-pickleball/production.env`, owned by
root:campus-pickleball, mode 0640, with directory mode 0750. Use Next dotenv
syntax, not shell `export` statements. Never source this file in a shell.
Set these values without printing them:

| Variable | Production value / handling |
| --- | --- |
| DATABASE_URL | Existing Tiger Data PostgreSQL URL, verified TLS; secret |
| DATABASE_SSL_CA_FILE | Optional absolute path to a trusted CA readable by service |
| AUTH0_DOMAIN | Existing Auth0 tenant hostname |
| AUTH0_CLIENT_ID | Existing Regular Web Application ID |
| AUTH0_CLIENT_SECRET | Existing application secret; secret |
| AUTH0_SECRET | New stable production-only 32-byte hex cookie key; secret |
| APP_BASE_URL | Exact `https://YOUR_DOMAIN` origin, without trailing slash |

All configuration is server-side; no NEXT_PUBLIC variables are used. Do not
put credentials in command arguments, Git, archives, or documentation. Next env
files expand `$`; escape literal dollar signs as `\$` and percent-encode database
credentials. Keep the production cookie key stable across releases/restarts.
Back it up securely with the environment file. Changing it invalidates sessions.

## Initial server setup

1. Verify the server belongs to the intended Vultr account and has no conflicting
   application on port 3000. Inspect ports 80/443 before installing Caddy. Use a
   site block in the existing proxy if there is already one; never replace it.
2. Install Node 24 from an official source with node at /usr/bin/node (or adjust
   the unit to its actual location), npm, curl, util-linux/flock, and Caddy using
   its official distribution instructions. Do not run the application as root.
3. Create system user/group `campus-pickleball`, with a home outside /home
   (e.g. /srv/campus-pickleball), and create `/srv/campus-pickleball/releases`
   owned by that user. Give it access to production.env as described above.
4. Install campus-pickleball.service in /etc/systemd/system. Run
   `sudo systemctl daemon-reload` and `sudo systemctl enable campus-pickleball`.
   Do not start until the first release establishes the current symlink.
5. For release.sh, grant the service user passwordless sudo for only these exact
   commands using a root-owned /etc/sudoers.d entry validated by `visudo -cf`:
   `/usr/bin/systemctl restart campus-pickleball.service` and
   `/usr/bin/systemctl stop campus-pickleball.service`. Do not grant general sudo.
6. Configure domain A records to this instance. Configure AAAA only if IPv6 works
   end to end; inspect stale AAAA and CAA records. Confirm authoritative and
   public DNS before issuing certificates. Review any CDN proxy and use valid
   origin TLS, never a setting that sends HTTP to the origin.
7. Preserve SSH access on its actual port before firewall changes. Allow TCP
   80/443 in both host and Vultr firewalls; keep port 3000 private. Preserve other
   services' rules. Outbound HTTPS/DNS and Tiger Data's configured port must work.
   If database network restrictions exist, allow the Vultr egress IP explicitly.
8. Replace both domain placeholders in Caddyfile.example, merge into the existing
   configuration, validate with `sudo caddy validate --config /etc/caddy/Caddyfile`,
   then reload Caddy. Enable its service at boot. Preserve its persistent
   certificate storage. Do not enable access logs containing OAuth query strings.

## Auth0

Select the application matching AUTH0_CLIENT_ID in the existing tenant. Append,
preserving development and other existing entries:

| Application setting | New entry |
| --- | --- |
| Allowed Callback URLs | https://YOUR_DOMAIN/auth/callback |
| Allowed Logout URLs | https://YOUR_DOMAIN |
| Allowed Web Origins | https://YOUR_DOMAIN |

Save in Applications → Applications → the matching application → Settings.
Keep the existing connections enabled. No API audience or wildcard is required.
The code explicitly defines /auth/login, /auth/callback, and /auth/logout;
successful login returns through /profile. Session cookies are HTTP-only,
SameSite=Lax, and Secure for the HTTPS APP_BASE_URL. Caddy supplies the canonical
Host, X-Forwarded-Host, and X-Forwarded-Proto. The application independently checks
the exact APP_BASE_URL Origin for mutations. Do not broaden CORS to fix a mismatch.

## Upload, release, and rollback

Create a unique release directory under /srv/campus-pickleball/releases. Transfer
only reviewed source: src/, public/ if present, scripts/, tests/, db/, deploy/,
package.json, package-lock.json, next.config.ts, next-env.d.ts if generated,
tsconfig.json, postcss.config.mjs, eslint.config.mjs, and .env.example. Never
transfer .git, .env.local, .next, node_modules, or private keys.

When archiving on macOS, use `COPYFILE_DISABLE=1 tar --no-xattrs --no-acls
--no-fflags` to exclude Apple metadata. Inspect the archive for `._*` files before
uploading; Linux lint treats these metadata files as invalid source files.

Set ownership to campus-pickleball. Run the release script as that user, using
an absolute path:

```sh
sudo -u campus-pickleball bash /srv/campus-pickleball/releases/RELEASE_ID/deploy/release.sh /srv/campus-pickleball/releases/RELEASE_ID
```

The script serializes releases, installs locked dependencies, lints, builds, and
runs read-only DB checks before changing the active release. It never runs
migrations or seed. Review pending migrations separately; do not reset data.
The current symlink switches atomically, then systemd restarts the application.
Startup failure restores the prior release; public/authentication failures require
the explicit rollback below. A short restart interruption is expected.

```sh
sudo journalctl -u campus-pickleball -n 100 --no-pager
sudo journalctl -u caddy -n 100 --no-pager
sudo systemctl restart campus-pickleball
sudo systemctl is-enabled campus-pickleball caddy
sudo systemctl is-active campus-pickleball caddy
```

Review logs locally; do not paste raw logs containing user data into chat. For
rollback, inspect `readlink -f /srv/campus-pickleball/previous`, then as the service
user create a temporary symlink to that directory and atomically rename it to
current (`mv -Tf` on Linux), restart the service, and rerun smoke verification.
Keep previous releases; no automatic pruning is configured. Code rollback does
not restore an edited environment file, proxy config, or a database migration.

For example, while no release is in progress:

```sh
rollback_release=$(readlink -f /srv/campus-pickleball/previous)
test -f "$rollback_release/.next/BUILD_ID"
sudo -u campus-pickleball ln -s "$rollback_release" /srv/campus-pickleball/.rollback
sudo -u campus-pickleball mv -Tf /srv/campus-pickleball/.rollback /srv/campus-pickleball/current
sudo systemctl restart campus-pickleball
SMOKE_BASE_URL=https://YOUR_DOMAIN node scripts/deployment-smoke.mjs
```

## Verification and pending acceptance

```sh
SMOKE_BASE_URL=https://YOUR_DOMAIN node scripts/deployment-smoke.mjs
```

This checks trusted HTTPS, HTTP redirection, configured home, anonymous write
denials, private caching, blocked token endpoints, Auth0 redirect/cookie settings,
public game discovery/filters, direct protected routes, and missing game pages.
It does not sign in. Follow with safe disposable profile/game integration tests
and read-only db:verify from the server; existing integration tests clean up only
their own identities and records. Confirm the production service's actual DB
connectivity, not just the local developer connection.

Inspect browser assets and production errors for secret leakage without printing
secret values. Restart the process and repeat the checks. Verify systemd boot
enablement; an actual reboot requires considering other services on the server.

On two physical devices, preferably Wi-Fi and cellular:

1. Open the HTTPS domain, refresh /games, and browse a game directly.
2. Sign in as different accounts. Confirm each sees its own profile and My Games.
3. Using an identifiable test game, host on device A, join/leave on B, refresh A
   to verify changes, then cancel on A and confirm B sees the cancellation.
4. Sign out on A; verify protected pages request login while B stays signed in.
5. Sign back in, confirm profile persistence, and check mobile layout/errors.

Record real login/logout, session isolation, device results, live URL, restart
results, deployed revision, and any remaining checks before calling deployment
complete. Server access and DNS configuration are complete. Real authenticated
browser and physical-device testing remain pending. No Auth0 administration
browser is connected; the owner was given the exact allowlist entries above.

## References

- Installed Next.js self-hosting and environment-variable guides in node_modules/next/dist/docs.
- https://docs.vultr.com/how-to-install-caddy-web-server-on-ubuntu-2604
- https://caddyserver.com/docs/install
- https://caddyserver.com/docs/automatic-https
- https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- https://auth0.github.io/nextjs-auth0/
