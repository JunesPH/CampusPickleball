#!/usr/bin/env bash
# Run as campus-pickleball on the target Linux server after staging a release.
set -euo pipefail
umask 027
root=/srv/campus-pickleball
release=$(realpath "${1:?Usage: bash deploy/release.sh /srv/campus-pickleball/releases/RELEASE_ID}")
[[ $(id -un) == campus-pickleball ]] || { echo 'Run as campus-pickleball.' >&2; exit 1; }
[[ $release == "$root"/releases/* && -f $release/package-lock.json ]] || exit 1
[[ -r /etc/campus-pickleball/production.env ]] || { echo 'Production environment file is missing.' >&2; exit 1; }
exec 9>"$root/.deployment.lock"
flock -n 9 || { echo 'Another release is in progress.' >&2; exit 1; }
[[ $(readlink -f "$root/current" 2>/dev/null || true) != "$release" ]] || {
    echo 'Refusing to rebuild the running release.' >&2; exit 1;
}
cd "$release"
# Reject environment files inadvertently uploaded with the source.
if find . -maxdepth 1 -name '.env*' ! -name '.env.example' | grep -q .; then
    echo 'Remove uploaded environment files; configure the shared environment instead.' >&2
    exit 1
fi
ln -s /etc/campus-pickleball/production.env .env.production.local
export NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
npm ci --include=dev
node --input-type=module <<'NODE'
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const required = ['DATABASE_URL', 'AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_CLIENT_SECRET', 'AUTH0_SECRET', 'APP_BASE_URL'];
if (required.some(key => !process.env[key]?.trim())) {
  console.error('Required production configuration is incomplete.'); process.exit(1);
}
try {
  const origin = new URL(process.env.APP_BASE_URL);
  if (origin.protocol !== 'https:' || origin.origin !== process.env.APP_BASE_URL ||
      !/^[a-f0-9]{64}$/i.test(process.env.AUTH0_SECRET)) throw new Error();
} catch {
  console.error('Production requires an exact HTTPS origin and a 32-byte hex cookie secret.'); process.exit(1);
}
NODE
npm run lint
npm run build
# Read-only checks; this script never migrates, seeds, or resets the database.
npm run db:check
npm run db:verify
old=$(readlink -f "$root/current" 2>/dev/null || true)
activate() {
    ln -s "$1" "$root/.current-$$"
    mv -Tf "$root/.current-$$" "$root/current"
    sudo -n /usr/bin/systemctl restart campus-pickleball.service
}
healthy() {
    for attempt in {1..30}; do
        if curl --fail --silent --max-time 5 http://127.0.0.1:3000/ -o /dev/null; then return 0; fi
        sleep 1
    done
    return 1
}
if activate "$release" && healthy; then
    if [[ -n $old ]]; then
        ln -s "$old" "$root/.previous-$$"
        mv -Tf "$root/.previous-$$" "$root/previous"
    fi
    echo 'Release activated. Run public HTTPS/Auth0 smoke verification next.'
else
    echo 'Release failed; restoring the prior release when available.' >&2
    if [[ -n $old ]]; then
        activate "$old"
        healthy || { echo 'Rollback health check failed; inspect service logs.' >&2; exit 1; }
    else
        sudo -n /usr/bin/systemctl stop campus-pickleball.service
        # Keep the failed release and logs available for diagnosis.
    fi
    exit 1
fi
