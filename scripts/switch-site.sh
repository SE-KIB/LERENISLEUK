#!/usr/bin/env bash
# Wisselt de live site (root) tussen de gearchiveerde "Leren is leuk"-app en de nieuwe site.
#   scripts/switch-site.sh lerenisleuk   -> oude app terug in de root zetten
# Daarna committen en pushen naar main; GitHub Pages publiceert de root.
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-}" in
  lerenisleuk)
    cp -r archief/lerenisleuk/. .
    echo "Leren is leuk staat weer in de root. Commit + push om live te zetten." ;;
  *) echo "Gebruik: $0 lerenisleuk" >&2; exit 1 ;;
esac
