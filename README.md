# Git flow kit for agent-driven projects

A project-agnostic copy of the hardened Git flow, CI and agent-review process from a production project
(snapshot of `develop` at `7d685e2`, Oct 29, 2026). Every PR is reviewed by a coding agent, the review verdict
becomes a red/green check (`review-gate`), and the owner merges. It is built to work on GitHub's **free plan**,
where private repos have no branch protection.

## What's in the box

| Path | What it does |
| ---- | ------------ |
| `.github/workflows/pr-lint.yml` | `title`: PR title is a Conventional Commit ≤ 72 chars (it becomes the squash commit). `base`: Git flow base rules (features into `develop`, only `release/*`/`hotfix/*` into `main`, `release/*` never into `develop`, `main`/`develop` never a PR head). `body`: ticket reference + `## Checklist` (skipped for Dependabot). |
| `.github/workflows/branch-guard.yml` | `pr-source`: only `release/*`/`hotfix/*` may target `main`. `direct-push`: a commit on `main`/`develop` that didn't come from a merged PR fails and opens a `direct-push` issue. |
| `.github/workflows/review-gate.yml` + `.github/scripts/review-gate.mjs` | Turns the agent's review heading into a check. Hardened: logic and tests run from the PR's **base** commit (a PR can't rewrite its own gate), staleness by `Reviewed-SHA`, owner-only override label, auto-pass for pure back-merges, a sync job so every check row shows the latest verdict, least-privilege tokens. |
| `tools/review-gate/*.test.mjs` | 29 tests for the gate logic, plus `workflow.test.mjs`, which locks the base-checkout shape. Run: `node --test "tools/review-gate/*.test.mjs"`. Needs Node 22 (`.nvmrc`). |
| `.github/pull_request_template.md` | Ticket, what/why, Touches, testing, and the checklist pr-lint requires. |
| `.github/CODEOWNERS` | Owner on everything. |
| `.github/dependabot.yml` | Weekly grouped dependency and Actions-SHA bumps into `develop`, with Conventional prefixes. |
| `.githooks/pre-push`, `.githooks/commit-msg` | Local guards: refuse pushes to `main`/`develop`; enforce Conventional Commits. |
| `.gitmessage` | Commit template. |
| `.claude/skills/review-pr/SKILL.md` | The `/review-pr <n>` command: hygiene, checks, parallel reviewer agents, one consolidated review in the format the gate reads. |
| `.claude/agents/code-reviewer.md` | Generic code-reviewer agent with `KIT` slots for project rules. |
| `CLAUDE.process.md` | The Workflow section to paste into `CLAUDE.md` / `AGENTS.md`. |
| `CONTRIBUTING.md`, `docs/git-flow.md` | The full process (branches, commits, PRs, release, hotfix, back-merge) and what each check enforces. |
| `examples/ci/*.example.yml` | The source project's stack-specific CI (pnpm + Turborepo `check`/`build`; Playwright e2e + Lighthouse budgets), kept as examples. |
| `setup.sh` | Applies repo settings and labels with `gh` (dry run unless `--apply`). |

All Actions are pinned to full commit SHAs with a `# vX.Y.Z` comment; Dependabot keeps them current.

## Placeholders

Search for `__` and `KIT:`. Fill these in:

| Placeholder | Example |
| ----------- | ------- |
| `__PROJECT_NAME__` | `My App` |
| `__OWNER__` | your GitHub login (CODEOWNERS) |
| `__CHECK_CMD__` / `__INSTALL_CMD__` | `pnpm check` / `pnpm install` |
| `__TICKET_EXAMPLE__` / `__TICKET_REGEX__` | `S1-03` / `S[0-9]+-[0-9]{2}` (or `[A-Z]+-[0-9]+`, `#[0-9]+`) |
| `__WEB_PACKAGE__` | workspace package name in the CI examples |
| Scopes | edit together in `pr-lint.yml`, `.githooks/commit-msg`, `.gitmessage`, `CONTRIBUTING.md` (default: `app api db auth deps ci docs tools repo`) |

## Setup

1. Copy the kit into the repo root (merge `.github/` with what's there), fill the placeholders, and copy or write
   your stack's `ci.yml` (see `examples/ci/`). Keep job names `check` and `build` if you reuse the required-check list below.
2. Run `./setup.sh owner/repo` to preview, then `./setup.sh owner/repo --apply`. It:
   - creates `develop` from `main` if missing and makes it the **default branch** (`main` is the release branch);
   - allows squash (features) and merge commits (release/hotfix/back-merge), disables rebase merges;
   - turns on **`delete_branch_on_merge`**;
   - creates labels `review-gate: override`, `direct-push`, `dependencies`, `github-actions`;
   - sets `core.hooksPath .githooks` and the commit template for this clone (each clone/worktree needs this once).
3. Commit the kit on a `chore/` branch and open the first PR into `develop`. The gate goes green once a review
   with the right heading exists.
4. Paste `CLAUDE.process.md` into `CLAUDE.md`/`AGENTS.md`, and add project rules in the `KIT` slots of the reviewer agent.
5. If you deploy with Vercel: `main` = production, `develop` and PRs = previews.

## The agent review loop

1. The coding agent branches from `origin/develop` (`feat/…`, `fix/…`, `chore/…`), commits Conventionally, opens a PR into `develop`.
2. The reviewer (agent or orchestrator) runs `/review-pr <n>` and posts **one COMMENT review** (the owner can't
   approve their own PR) whose first two lines are exactly:
   ```
   ## Review: APPROVE | REQUEST CHANGES | COMMENT
   Reviewed-SHA: <full head sha>
   ```
   `## Re-review: …`, `## Re-review 2: …`, `## Code review: …` also count; headings starting with `Design` count as a
   separate design verdict. Only reviews posted from the **owner's account** count.
3. On REQUEST CHANGES, findings are written as actionable `file:line — problem → fix` items so the coding agent can
   fix them with new commits (no force-push), then re-review.
4. `review-gate` is green when the latest code review covers the current head (only true merge commits after it) and
   no latest review says REQUEST CHANGES. APPROVE and COMMENT both pass.
5. **The owner merges** (agents never do): squash into `develop`; merge commit for release/hotfix/back-merge.
   Emergency: the owner adds `review-gate: override` (ignored if anyone else adds it).

## Release, hotfix, back-merge

- **Release:** `release/x.y.z` from `origin/develop` → bump version + CHANGELOG → PR into `main`
  (`chore(repo): release x.y.z`) → review → owner merges with a **merge commit** → tag `origin/main`
  (`git tag -a vX.Y.Z origin/main && git push origin vX.Y.Z`, `gh release create vX.Y.Z --verify-tag --generate-notes`).
- **Back-merge:** never open a PR with `main` as the head (it would be deleted on merge). Cut
  `chore/back-merge-x.y.z` from `origin/main`, PR into `develop`, merge commit. The gate auto-passes it if it has no
  commits beyond `main`.
- **Hotfix:** `hotfix/x.y.z` from `origin/main` → fix + test → PR into `main` (merge commit) → tag → back-merge. If a
  release branch is open, merge the hotfix into it instead.

## Free plan vs paid

| | Free plan, private repo | GitHub Pro/Team (private) or any public repo |
| - | - | - |
| Branch protection / rulesets | Not available | Available |
| Enforcement | **Flag, don't block:** checks go red, `direct-push` opens an issue, local hooks refuse pushes. Merging on red is still technically possible, so "merge only on green" is a process rule. | Require PRs on `main` and `develop`; require `check`, `build`, `title`, `body`, `base`, `review-gate` (and `e2e`); require up to date; include admins; block force-push and deletion. |
| Approvals | GitHub won't let a solo owner approve their own PR, so the verdict lives in the COMMENT review body and `review-gate` | Keep required approvals at **0** for a solo owner; `review-gate` remains the review requirement |
| CODEOWNERS | Informational | Can be required (only useful with a second reviewer account) |
| Actions minutes | 2,000 min/month on private repos | 3,000 (Pro) or more; unlimited on public repos |

## Known gaps and open items

- **Workflow file trust (follow-up to audit item CI-01).** The gate's *script and tests* come from the base commit,
  but GitHub always reads `review-gate.yml` itself from the PR, so a PR that edits the workflow could weaken the gate.
  Treat any diff to `.github/workflows/review-gate.yml` as high-risk in review. Fully closing it needs branch protection/rulesets
  (paid for private repos) or a `pull_request_target` design, which brings its own risks.
- A change to the gate logic takes effect only for PRs opened after it merges (by design).
- A true merge of another feature branch after the reviewed SHA does not make the review stale (accepted gap).
- Everything above "flags" rather than blocks until protection is available.
