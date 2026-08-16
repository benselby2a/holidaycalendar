#!/bin/sh
set -e
range="${1:-HEAD~1..HEAD}"
changed=$(git diff --name-only "$range")
fail=0
for f in pack.js pack.css; do
  echo "$changed" | grep -qx "$f" || continue
  old=$(git show "${range%%..*}:index.html" | grep -o "$f?v=[^\"]*" || true)
  new=$(git show "${range##*..}:index.html" | grep -o "$f?v=[^\"]*" || true)
  if [ "$old" = "$new" ]; then
    echo "FAIL: $f changed but its cache-bust is still $new"; fail=1
  else
    echo "ok: $f  $old -> $new"
  fi
done
[ "$fail" = 0 ] || exit 1
echo "cache-bust check passed"
