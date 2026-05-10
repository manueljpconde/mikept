#!/usr/bin/env bash
set -euo pipefail

eval "echo \"$(cat /etc/kong/kong.yml.template)\"" > /etc/kong/kong.yml
exec /entrypoint.sh kong docker-start
