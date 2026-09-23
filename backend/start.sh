#!/bin/sh
# Applies schema.sql + migrations (idempotent, safe to repeat) before every
# boot, then starts the API. Baked into the image as the default CMD so this
# behaves identically whether run directly, via docker-compose, or as a
# platform's "dockerCommand" override — those don't all invoke a shell the
# same way a plain YAML command string might suggest.
#
# Migration failure does NOT stop the server from starting. It used to
# (via `set -e` + `&&`), and that turned "the DB was briefly unreachable at
# boot" (e.g. a free-tier managed MySQL host powered off from inactivity)
# into "the entire backend crash-loops and never comes back up" — including
# the /api/health endpoint that the keep-alive workflow depends on to ever
# detect and recover from exactly that situation. The app already degrades
# per-request when the DB is down (config/db.js, /api/health's own
# database:"disconnected" field) — the server just needs to be running for
# that to matter at all.
node database/migrate.js || echo "⚠️  Migration failed — starting the server anyway so health checks and recovery are still possible."
exec node server.js
