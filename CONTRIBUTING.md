# Contributing: Git Flow

We use **[Git Flow](https://nvie.com/posts/a-successful-git-branching-model/)** with pull requests for every change.

- **`main`** is production. It only ever receives `release/*` and `hotfix/*` PRs, and every commit on it is a tagged version.
- **`develop`** is the integration branch, and the repo's default. All feature work lands here first, and it must always be green.
- Nobody, human or agent, pushes directly to `main` or `develop`. Agents never merge; **the owner merges**.

```
feature/fix/chore/docs ──PR (squash)──▶ develop ──release/x.y.z──PR (merge)──▶ main ──tag vX.Y.Z
                                          ▲                                       │
                                          └── chore/back-merge-x.y.z (from main) ◀┘   PR (merge) into develop
hotfix/x.y.z ◀── branched from main ──PR (merge)──▶ main ──tag──▶ back-merge branch ──▶ develop
```

## Branches

| Branch                                  | From      | PR into   | Merge style      | Example                  |
| --------------------------------------- | --------- | --------- | ---------------- | ------------------------ |
| `feat/`                                 | `develop` | `develop` | squash           | `feat/s1-birth-form`     |
| `fix/`                                  | `develop` | `develop` | squash           | `fix/feb-3-boundary`     |
| `chore/`, `docs/`, `refactor/`, `test/` | `develop` | `develop` | squash           | `chore/s1-quality-gates` |
| `release/x.y.z`                         | `develop` | `main`    | **merge commit** | `release/0.1.0`          |
| `hotfix/x.y.z`                          | `main`    | `main`    | **merge commit** | `hotfix/0.1.1`           |
| `chore/back-merge-x.y.z`                | `main`    | `develop` | **merge commit** | `chore/back-merge-0.1.0` |

- Sprint tickets are named `<prefix>/s<sprint>-<slug>`. One ticket is one branch and one PR.
- Feature PRs are squashed, so `develop` reads as one Conventional Commit per ticket.
- Release and hotfix PRs use real merge commits, so `main` and `develop` keep shared history and back-merges stay
  conflict-free.

## One-time setup per clone

```bash
git config core.hooksPath .githooks   # commit-msg + pre-push guards
git config commit.template .gitmessage
```

## Commits

[Conventional Commits](https://www.conventionalcommits.org), enforced locally by `.githooks/commit-msg`:

```
<type>(<scope>): <description>        ≤ 72 chars, lower case, imperative, no period

<body: why, not what; wrap at 72>      optional
Refs: __TICKET_EXAMPLE__                            ticket, when there is one
```

- **type:** `feat` · `fix` · `docs` · `style` · `refactor` · `perf` · `test` · `build` · `ci` · `chore` · `revert`
- **scope:** `app` · `api` · `db` · `auth` · `deps` · `ci` · `docs` · `tools` · `repo` <!-- KIT: your scopes; keep in sync with pr-lint.yml, .githooks/commit-msg, .gitmessage -->
- Good: `feat(api): add rate limiting to the login route`, `fix(app): announce form errors to screen readers`
- Bad: `updates`, `WIP`, `Fixed stuff.`, `feat: Added The Form`
- Make each commit one logical change that builds and passes tests. Use `!` (`feat(api)!: …`) plus a `BREAKING CHANGE:`
  footer for breaking API changes.

## Pull requests

1. **Branch** from up-to-date `develop` (`git fetch && git switch -c feat/s1-… origin/develop`). Parallel agents each use
   their own **git worktree**. To stack on an unmerged PR, branch from its head, say "stacked on #N" in the body, and
   rebase onto `develop` once it merges.
2. **Scope.** Stay inside the ticket's **Touches** paths in the sprint file. If you need another ticket's paths, stop and
   coordinate; that is what keeps parallel PRs conflict-free.
3. **Size.** Keep it under about 400 changed lines of code (data, lockfiles and generated files excluded). Split bigger tickets.
4. **Check locally.** Run `__CHECK_CMD__` (and your end-to-end suite for UI changes).
5. **Open the PR against `develop`** (`gh pr create --base develop`; it is the default) with the template. The **title is a Conventional Commit**, because it becomes the squash commit on `develop`
   (enforced by the `pr-lint` workflow). The body names the ticket (`__TICKET_EXAMPLE__`, or "no ticket") and keeps the checklist.
   UI PRs include screenshots at 375px and 1280px.
6. **Review.** Run `/review-pr <n>`. It runs the checks plus the reviewer agents in parallel and posts one consolidated review on the PR:
   - [`code-reviewer`](.claude/agents/code-reviewer.md): correctness, architecture, security, tests, git hygiene
   - optional extra reviewers (KIT), e.g. a design-system reviewer for UI paths

   Fix every **blocking** finding in new commits (don't force-push over review history), then re-run `/review-pr`.

7. **Merge.** Merge only when **`review-gate`** is green, along with `check`, `build`, `pr-lint` (and `e2e`). The owner
   squash-merges into `develop`; the branch is deleted automatically. `review-gate` reads the verdict heading of the
   owner's `/review-pr` review (see [docs/git-flow.md](docs/git-flow.md#review-gate)): it is red until the latest code
   review covers the PR's current commits, and red while the latest code or design review says **REQUEST CHANGES**.
   APPROVE and COMMENT both pass. Any non-merge commit after the reviewed SHA (a push, a rebase or force-push) needs a
   re-review; a true merge commit (for example merging `develop` in) does not.
   **Back-merges** (`chore/back-merge-*` whose commits are all already on `main`) pass without a review.
   **Override (owner only):** the owner may add the PR label `review-gate: override` to pass the check with a warning,
   for example when the review agents are unavailable. The label is ignored when anyone else applies it.

8. **Dependabot PRs** ([`.github/dependabot.yml`](.github/dependabot.yml)) open weekly against `develop`: npm updates
   grouped (see the file) with a catch-all `minor-patch`, and GitHub Actions SHA bumps grouped as
   `actions`. They get no special case: run `/review-pr <n>` on each, and `review-gate` applies as for any other PR.
   `pr-lint` skips only its ticket and checklist body rules for `dependabot[bot]`; the title and base rules still apply.

## Releases (end of every sprint)

Production deploys from `main` (KIT: link your deploy doc; e.g. Vercel: `main` = production, `develop` and PRs = previews).

1. `git switch -c release/0.<sprint>.0 origin/develop`. Then:
   - bump versions
   - write the `CHANGELOG.md` entry (from the squash commits since the last tag)
   - fix only release blockers on this branch
2. PR `release/0.<sprint>.0` → `main`, titled `chore(repo): release 0.<sprint>.0`. Run `/review-pr`, and the owner
   **merges with a merge commit** (not squash).
3. Tag the merge commit on `main`, not your local release branch:
   `git fetch origin && git tag -a v0.<sprint>.0 origin/main -m "v0.<sprint>.0" && git push origin v0.<sprint>.0`,
   then `gh release create v0.<sprint>.0 --verify-tag --generate-notes`.
4. **Back-merge.** Never open a PR with `main` itself as the head branch: the repo deletes head branches on merge,
   and `main` is not protected on this plan. Instead cut a short-lived branch:
   `git switch -c chore/back-merge-0.<sprint>.0 origin/main`, push it, and open a PR into `develop` titled
   `chore(repo): back-merge 0.<sprint>.0`, merged with a **merge commit**.
5. Plan the next sprint.

## Hotfixes (production bug on `main`)

1. `git switch -c hotfix/0.<sprint>.<n> origin/main`, fix it with a test, and bump the patch version and CHANGELOG.
2. PR → `main` (merge commit), then tag `origin/main` as in Releases step 3.
3. Back-merge through `chore/back-merge-0.<sprint>.<n>` cut from `origin/main`, as in Releases step 4. If a `release/*`
   branch is open, merge the hotfix into that release branch instead, and it reaches `develop` with the release.

## Protecting `main` and `develop`

The repo is private on a free GitHub plan, so **GitHub branch protection is not available**: it needs GitHub Pro,
or a public repo. Until then:

- **Local hook.** `.githooks/pre-push` refuses pushes to `main` and `develop`.
- **CI.** The `pr-lint` workflow fails PRs into `main` that do not come from `release/*` or `hotfix/*`, fails
  `release/*` PRs into `develop`, and checks PR titles (Conventional, ≤ 72 chars, no trailing period) and bodies.
- **Repo settings.** Default branch is `develop`; squash and merge commits are allowed (squash for features, merge for
  release and hotfix); branches are deleted on merge.
- **CI.** The `review-gate` workflow turns the `/review-pr` verdict into a check (see Pull requests step 7).
- **Process.** Merge only when `review-gate` and all other checks are green.

When protection becomes available:

- **`main` and `develop`:** require a PR, require the checks `check`, `build`, `title`, `body`, `base`, `review-gate` (and `e2e`), require
  the branch to be up to date, include administrators, and block force pushes and deletion.
- **Approvals:** 0 required, since GitHub does not let a single owner approve their own PRs.
