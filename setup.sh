#!/usr/bin/env bash
# Apply the Git flow kit to a GitHub repo. Dry run by default; pass --apply to make changes.
# Usage: ./setup.sh <owner/repo> [--apply]
# Run from the root of the target repo's clone after copying the kit files in. Needs gh (logged in).
set -euo pipefail
REPO="${1:?usage: setup.sh <owner/repo> [--apply]}"
APPLY="${2:-}"
run() { if [ "$APPLY" = "--apply" ]; then echo "+ $*"; "$@"; else echo "(dry run) $*"; fi; }

# 1. develop exists and is the default branch (main stays the release branch).
if ! gh api "repos/$REPO/branches/develop" >/dev/null 2>&1; then
  main_sha=$(gh api "repos/$REPO/git/ref/heads/main" --jq .object.sha)
  run gh api -X POST "repos/$REPO/git/refs" -f ref=refs/heads/develop -f sha="$main_sha"
fi
# 2. Repo settings: develop default, squash + merge commits (no rebase), delete branches on merge.
run gh api -X PATCH "repos/$REPO" -f default_branch=develop \
  -F allow_squash_merge=true -F allow_merge_commit=true -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY
# 3. Labels used by the workflows and Dependabot.
run gh label create "review-gate: override" --repo "$REPO" --color FBCA04 --description "Owner only: pass review-gate with a warning" --force
run gh label create direct-push --repo "$REPO" --color B60205 --description "Commit landed without a PR" --force
run gh label create dependencies --repo "$REPO" --color 0366D6 --description "Dependency update" --force
run gh label create github-actions --repo "$REPO" --color 000000 --description "GitHub Actions update" --force
# 4. Local hooks for this clone.
run git config core.hooksPath .githooks
run git config commit.template .gitmessage
run chmod +x .githooks/commit-msg .githooks/pre-push
# 5. Leftover placeholders.
echo "Placeholders still to fill:"; grep -rnoE '__[A-Z_]+__' --exclude=setup.sh --exclude=README.md . || echo "  none"
