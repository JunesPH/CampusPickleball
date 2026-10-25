#!/usr/bin/env bash
# Run as campus-pickleball, not as the SSH login user.
set -euo pipefail
cd /srv/campus-pickleball/current
export NODE_ENV=production
export RUN_PROFILE_DB_TESTS=1 RUN_GAME_DB_TESTS=1
export AUDIT_HTTP_BASE_URL=https://campuspickleball.us
node scripts/audit-browser-secrets.mjs
node --conditions=react-server --import ./scripts/load-production-env.mjs --test \
    tests/profiles.integration.test.mjs tests/games.integration.test.mjs \
    tests/game-membership.integration.test.mjs tests/game-cancellation.integration.test.mjs
node --conditions=react-server scripts/db.mjs verify > /srv/campus-pickleball/last-db-verification.json
node -e 'const fs=require("node:fs");const r=JSON.parse(fs.readFileSync("/srv/campus-pickleball/last-db-verification.json","utf8"));console.log(JSON.stringify({status:r.status,connection:r.connection,counts:r.counts}));'
