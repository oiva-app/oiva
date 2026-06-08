#!/usr/bin/env sh
set -eu

echo "running database migrations"
node dist/scripts/migrate.js

echo "starting Oiva agent server"
exec node .mastra/output/index.mjs
