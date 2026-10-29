# Changelog

All notable changes to this kit. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions: [SemVer](https://semver.org/).
Sections map to Conventional Commit types: **Added** (feat), **Fixed** (fix), **Changed** (refactor/perf/build), **Security**, **Docs**.

## [1.0.0] - 2026-10-29

### Added

- `tools/guards`: source-only file guard (blocked extensions/paths, env files, size limits, binary detection), hardcoded URL/host/IP guard, PII and key-material guard, all driven by `.github/guards/config.json`, with tests.
- gitleaks secret scanning in CI (`guards.yml`) and in the new `pre-commit` hook, with `.gitleaks.toml`.
- `kit-lint` job: actionlint, zizmor, shellcheck, yamllint, markdownlint. Stack-agnostic `lint.yml` with placeholders.
- `gate-tripwire` in branch-guard: changes to workflows, hooks, guards and gate files need the owner's `gate-change: approved` label.
- PR size warning, weekly `stale` workflow, issue templates, `SECURITY.md`, `AGENTS.md`, Copilot instructions pointer.
- `scripts/verify.sh` / `make verify`: every local check CI runs, in one command.
- Lint baseline: `.editorconfig`, Prettier, commitlint, ESLint flat config and ruff examples, staged format+lint hook example.
- Examples: CodeQL, dependency review, release-please, release SBOM.
- `.gitignore`, `.gitattributes`, `.env.example` templates.

### Changed

- Dependabot waits 7 days (cooldown) before proposing new releases.
- Workflows: job-level permissions, `concurrency` cancel-in-progress, timeouts, `persist-credentials: false`.
- CI examples skip docs-only changes; e2e/Lighthouse run only for PRs into `main`, the `run-e2e` label, or pushes to `main`.
- `setup.sh` installs all hooks, creates the new labels, and enables secret scanning, push protection and private vulnerability reporting where available.

## [0.1.0] - 2026-10-29

- Initial kit: pr-lint, branch-guard, review-gate (+ tests), PR template, CODEOWNERS, Dependabot, hooks, agent review commands, docs.
