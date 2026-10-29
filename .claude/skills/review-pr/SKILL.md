---
name: review-pr
description: Review a __PROJECT_NAME__ pull request end to end. Runs the checks, runs the reviewer agents in parallel, and posts one consolidated review comment on the PR. Use when asked to review a PR or before merging one.
---

# Review a PR

Input: a PR number (or the current branch's PR).

1. **Context.** Run `gh pr view <n> --json title,body,headRefName,headRefOid,baseRefName,files,commits,additions,deletions`.
   Note `headRefOid`: it is the SHA you are reviewing, and it goes on line 2 of the review.
   Find the ticket from the body (for example `__TICKET_EXAMPLE__`; KIT: say where tickets live, e.g. `docs/sprints/`) and note its _Touches_ paths.
2. **Hygiene (do it yourself):**
   - Base branch follows Git Flow: `develop` for feature work; `main` only for `release/*` and `hotfix/*`.
   - Title matches `type(scope): description`.
   - Body names the ticket and keeps the checklist.
   - Every changed file is inside the ticket's Touches paths.
   - Size is ≲ 400 changed lines of code, excluding lockfiles, data and generated files (KIT: list your paths).
   - Commit subjects are Conventional.
3. **Checks.** Run `gh pr checks <n>`. In a worktree of the PR branch, run `__INSTALL_CMD__ && __CHECK_CMD__`. If a check fails,
   the verdict is REQUEST CHANGES.
4. **Reviewers.** Launch in parallel, giving each the PR number and ticket id:
   - the `code-reviewer` agent (correctness, architecture, parity, security, tests)
   - KIT: optional extra reviewers, e.g. a `design-system-reviewer` agent only when the PR touches UI paths.
     Its review heading must start with `Design` (e.g. `## Design-system review: APPROVE`) so the gate reads it as the design verdict.
5. **Verify findings.** For each blocking finding, check it against the code yourself. Drop anything you cannot confirm.
6. **Post one review**, with `gh pr review <n> --comment --body-file <file>`. Use `--comment`, because GitHub does not let the author
   approve their own PR and every PR here is opened from the owner's account. Lines 1 and 2 are **machine-read by the
   `review-gate` check** (`.github/scripts/review-gate.mjs`), so keep them exact:
   - Line 1 is exactly `## Review: <VERDICT>`, with one of the three verdicts in capitals and nothing after it.
     `## Re-review: …`, `## Re-review 2: …`, `## Code review: …`, `## Design-system review: …` and
     `## Design re-review: …` are also read; `Design…` headings count as the design verdict. Anything else, or the
     heading on a later line, is ignored and leaves the check red.
   - Line 2 is `Reviewed-SHA: <headRefOid from step 1>` (the full lower-case SHA). If the head moved since step 1, the
     gate treats the review as stale, which is what you want: re-run the review on the new head.

   Format:

   ```
   ## Review: <APPROVE | REQUEST CHANGES | COMMENT>
   Reviewed-SHA: <headRefOid>
   **Checks:** ci ✅/❌ · pr-lint ✅/❌ · e2e ✅/❌ · local `__CHECK_CMD__` ✅/❌
   **Hygiene:** title ✅ · ticket ✅ · scope ✅ · size N lines ✅
   ### Blocking
   1. file:line — problem → fix
   ### Nits
   ### Verified
   what was run or rendered
   ```

7. Report the verdict to the user. **Never merge.** The owner merges once `review-gate` and the other checks are green: squash into `develop`, or a merge commit for `release/*`/`hotfix/*` PRs into `main` and for `chore/back-merge-*` PRs into `develop`. COMMENT means no blockers but suggestions worth weighing; treat it like APPROVE for merging.
