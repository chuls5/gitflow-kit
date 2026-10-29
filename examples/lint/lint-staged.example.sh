#!/bin/sh
# EXAMPLE: the format+lint step the pre-commit hook runs on staged files. Copy to .githooks/lint-staged
# and make it executable; .githooks/pre-commit calls it when present. Receives staged paths as args.
# JS/TS:
#   npx --no-install prettier --write "$@" && npx --no-install eslint --fix --no-warn-ignored "$@"
# Python:
#   ruff format "$@" && ruff check --fix "$@"
set -eu
js=$(printf '%s\n' "$@" | grep -E '\.(js|jsx|ts|tsx|mjs|cjs|json|css|md|ya?ml)$' || true)
py=$(printf '%s\n' "$@" | grep -E '\.py$' || true)
# shellcheck disable=SC2086 # word splitting on newline-separated paths is intended
if [ -n "$js" ] && [ -x node_modules/.bin/prettier ]; then node_modules/.bin/prettier --write $js; fi
# shellcheck disable=SC2086
if [ -n "$py" ] && command -v ruff >/dev/null; then ruff format $py && ruff check --fix $py; fi
# Re-stage what the formatters changed.
# shellcheck disable=SC2086
[ -z "$js$py" ] || git add -- $js $py
