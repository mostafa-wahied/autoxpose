#!/bin/sh
set -e

if [ "$(id -u)" = "0" ]; then
  SOCKET="/var/run/docker.sock"
  if [ -S "$SOCKET" ]; then
    SOCKET_GID="$(stat -c '%g' "$SOCKET" 2>/dev/null || echo 0)"
    if [ "$SOCKET_GID" != "0" ]; then
      GROUP_NAME="$(awk -F: -v gid="$SOCKET_GID" '$3 == gid {print $1; exit}' /etc/group)"
      if [ -z "$GROUP_NAME" ]; then
        GROUP_NAME="dockerhost"
        addgroup -g "$SOCKET_GID" "$GROUP_NAME" 2>/dev/null || true
      fi
      addgroup autoxpose "$GROUP_NAME" 2>/dev/null || true
    fi
  fi

  chown autoxpose:nodejs /app/packages/backend/data 2>/dev/null || true

  exec su-exec autoxpose "$@"
fi

exec "$@"
