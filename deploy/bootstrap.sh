#!/usr/bin/env bash
# Initial setup for the inspected, otherwise empty Ubuntu Vultr instance.
# Review existing services before running; this never replaces a Caddyfile.
set -euo pipefail
[[ $(id -u) == 0 ]] || exit 1
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg xz-utils debian-keyring debian-archive-keyring apt-transport-https
if ! command -v node >/dev/null; then
    work=$(mktemp -d)
    cd "$work"
    curl -fsSLO https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt
    archive=$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ {print $2}' SHASUMS256.txt)
    [[ -n $archive && $archive != *$'\n'* ]] || exit 1
    curl -fsSLO "https://nodejs.org/dist/latest-v24.x/$archive"
    grep -F "  $archive" SHASUMS256.txt | sha256sum -c -
    tar -xJf "$archive" -C /opt
    ln -s "/opt/${archive%.tar.xz}/bin/node" /usr/bin/node
    ln -s "/opt/${archive%.tar.xz}/bin/npm" /usr/local/bin/npm
    ln -s "/opt/${archive%.tar.xz}/bin/npx" /usr/local/bin/npx
fi
if ! command -v caddy >/dev/null; then
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o /tmp/campus-caddy-signing.key
    gpg --batch --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg /tmp/campus-caddy-signing.key
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
    chmod 0644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
fi
if ! id campus-pickleball >/dev/null 2>&1; then
    useradd --system --user-group --create-home --home-dir /srv/campus-pickleball --shell /usr/sbin/nologin campus-pickleball
fi
install -d -o campus-pickleball -g campus-pickleball -m 0750 /srv/campus-pickleball/releases
install -d -o root -g campus-pickleball -m 0750 /etc/campus-pickleball
printf '%s\n' 'campus-pickleball ALL=(root) NOPASSWD: /usr/bin/systemctl restart campus-pickleball.service, /usr/bin/systemctl stop campus-pickleball.service' > /etc/sudoers.d/campus-pickleball
chmod 0440 /etc/sudoers.d/campus-pickleball
visudo -cf /etc/sudoers.d/campus-pickleball
# Preserve existing SSH rules; add only the public web ports.
ufw allow 80/tcp
ufw allow 443/tcp
node --version
npm --version
caddy version
