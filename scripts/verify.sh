#!/usr/bin/env bash
# One entrypoint for every local check CI runs. Usage: scripts/verify.sh  (or: make verify)
# Missing optional tools are reported as SKIP; CI runs them for real.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1
fail=0; skipped=()
step() { local name=$1; shift; printf '\n▶ %s\n' "$name"; if "$@"; then echo "✔ $name"; else echo "✖ $name"; fail=1; fi; }
have() { command -v "$1" >/dev/null 2>&1; }
opt() { local tool=$1 name=$2; shift 2; if have "$tool"; then step "$name" "$@"; else skipped+=("$name ($tool not installed)"); fi; }

step "guards: files, urls, pii" node tools/guards/guards.mjs all
step "guard tests" node --test tools/guards/*.test.mjs
step "review-gate tests" node --test tools/review-gate/*.test.mjs
opt gitleaks "gitleaks (history)" gitleaks git --redact --no-banner -c .gitleaks.toml
opt actionlint "actionlint" actionlint
opt zizmor "zizmor" zizmor --offline --min-severity medium .github
mapfile -t sh_files < <(git ls-files '*.sh' '.githooks/*')
opt shellcheck "shellcheck" shellcheck "${sh_files[@]}"
opt yamllint "yamllint" yamllint -s .
if have npx; then step "markdownlint" npx --yes markdownlint-cli2@0.24.0 "**/*.md"; else skipped+=("markdownlint (npx)"); fi
# KIT: your stack's checks (same commands as the lint job in .github/workflows/guards.yml).
if grep -q '__LINT_CMD__' .github/workflows/lint.yml 2>/dev/null; then skipped+=("project lint/format (fill __LINT_CMD__)"); else
  step "project lint" bash -c "__LINT_CMD__"; step "project format" bash -c "__FORMAT_CHECK_CMD__"; fi

[ ${#skipped[@]} -eq 0 ] || { printf '\nSKIPPED:\n'; printf '  - %s\n' "${skipped[@]}"; }
if [ $fail -eq 0 ]; then echo; echo "verify: all checks passed"; else echo; echo "verify: FAILED"; fi
exit $fail
