#!/bin/sh
# Applies schema.sql + migrations (idempotent, safe to repeat) before every
# boot, then starts the API. Baked into the image as the default CMD so this
# behaves identically whether run directly, via docker-compose, or as a
# platform's "dockerCommand" override — those don't all invoke a shell the
# same way a plain YAML command string might suggest.
set -e
node database/migrate.js
exec node server.js
