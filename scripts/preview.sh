#!/usr/bin/env bash
# Launch a local preview of Universal PalsPayIn.
# Runs the dev server in the foreground — press Ctrl-C to stop.
# macOS/Linux equivalent of preview.ps1.
#
#   Usage:  ./scripts/preview.sh [port]      (default 5201)
#
# 5201 is this app's port in the registry (Docs_UNI_SIM/dev-preview.md).
# --strictPort means a port clash fails loudly instead of silently serving
# this app on another app's port.
# First run installs deps if node_modules is missing.
#
# NOTE — the ledger itself is fully local; nothing here needs the internet.
# The optional relay sync talks to opensource.unisim.co.uk/palspayin/api in
# dev too. Point it elsewhere with VITE_RELAY_ORIGIN (e.g. a local
# `wrangler dev` of this repo, which serves the same API from worker/relay.js).

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PORT="${1:-5201}"

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies (first run)…"
  npm install
fi

echo "Universal PalsPayIn → http://localhost:$PORT"
exec npm run dev -- --port "$PORT" --strictPort
