#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 1 ]]; then
  printf 'Usage: bash scripts/TestFontApkGate.sh SOURCE_APK\n' >&2
  exit 2
fi

fixture_dir=$(mktemp -d)
trap 'rm -rf "$fixture_dir"' EXIT
java scripts/MakeMissingFontFixture.java "$1" "$fixture_dir/missing-font.zip"

# Match GitHub's explicit `shell: bash` invocation. tee succeeds, but the verifier must fail the gate.
status=0
bash --noprofile --norc -e -o pipefail -c \
  'java scripts/VerifyFontApk.java "$1" | tee "$2"' font-gate \
  "$fixture_dir/missing-font.zip" "$fixture_dir/output.txt" 2> "$fixture_dir/error.txt" || status=$?
if [[ $status != 1 ]]; then
  printf 'Expected missing-font pipeline exit 1, actual %s\n' "$status" >&2
  cat "$fixture_dir/error.txt" >&2
  exit 1
fi
case "$(< "$fixture_dir/error.txt")" in
  *'Missing APK entry res/font/outfit_variable.ttf'*) ;;
  *) cat "$fixture_dir/error.txt" >&2; exit 1 ;;
esac
printf 'PASS: missing res/font/outfit_variable.ttf; verifier | tee pipeline exit=%s\n' "$status"
