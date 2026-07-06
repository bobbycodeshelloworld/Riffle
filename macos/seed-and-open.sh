#!/bin/bash
# seed-and-open.sh <template.html> [file.md|file.sql ...]
#
# Builds a temp copy of the MD+SQL Viewer HTML with the given file(s) injected
# as a window.__SEED__ array (base64), then opens it in the default browser.
# Called by the "MD+SQL Viewer.app" AppleScript launcher; also usable directly.
set -euo pipefail

TEMPLATE="${1:-}"
if [ -z "$TEMPLATE" ] || [ ! -f "$TEMPLATE" ]; then
  echo "usage: seed-and-open.sh <template.html> [file.md|file.sql ...]" >&2
  exit 1
fi
shift

OUT="${TMPDIR:-/tmp}/mdsqlview-$$-${RANDOM}.html"
SEEDFILE="${TMPDIR:-/tmp}/mdsqlview-seed-$$-${RANDOM}"
trap 'rm -f "$SEEDFILE"' EXIT

# Build the seed <script> only if we were handed files. JSON-escape name/path
# (backslash then quote); the body is base64 so it needs no escaping.
if [ "$#" -gt 0 ]; then
  {
    printf '<script>window.__SEED__=['
    first=1
    for f in "$@"; do
      [ -f "$f" ] || continue
      name=$(basename -- "$f")
      path=$f
      name=${name//\\/\\\\}; name=${name//\"/\\\"}
      path=${path//\\/\\\\}; path=${path//\"/\\\"}
      name=${name//</\\u003c}; path=${path//</\\u003c}
      name=$(printf '%s' "$name" | tr -d '\000-\037')
      path=$(printf '%s' "$path" | tr -d '\000-\037')
      b64=$(base64 < "$f" | tr -d '\n')
      [ "$first" -eq 1 ] || printf ','
      printf '{"name":"%s","path":"%s","b64":"%s"}' "$name" "$path" "$b64"
      first=0
    done
    printf ']</script>'
  } > "$SEEDFILE"
else
  : > "$SEEDFILE"
fi

# Replace the placeholder line with the seed (read from file, so a large payload
# never has to fit in an awk -v variable).
awk -v sf="$SEEDFILE" '
  index($0, "__VIEWER_SEED__") { while ((getline l < sf) > 0) print l; close(sf); next }
  { print }
' "$TEMPLATE" > "$OUT"

open "$OUT"
