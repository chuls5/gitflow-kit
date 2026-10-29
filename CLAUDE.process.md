<!-- KIT: paste this section into the project's CLAUDE.md and AGENTS.md (agents read one or the other). -->
## Workflow

Follow [CONTRIBUTING.md](CONTRIBUTING.md): a branch per ticket, stay inside the ticket's **Touches** paths, run `__CHECK_CMD__`,
write Conventional Commits, open a PR whose title is a Conventional Commit, then run `/review-pr <n>`
(the reviewer agents). This is Git flow: branch from and PR into `develop`; only `release/*` and `hotfix/*` go to `main`.
Never commit or push to `main` or `develop`, and never merge: the owner merges.

When a review asks for changes, fix every blocking finding in new commits (don't force-push over review history), push,
and ask for a re-review. Review bodies start with `## Review: <APPROVE|REQUEST CHANGES|COMMENT>` on line 1 and
`Reviewed-SHA: <head sha>` on line 2, because the `review-gate` check machine-reads them.

### Guardrails (non-negotiable for agents)

- **Never commit secrets.** No keys, tokens, passwords, connection strings or `.env*` files (only `.env.example`, with names and no values). If one slips in, stop, tell the owner, and treat it as leaked: rotate it; deleting the commit is not enough.
- **Never hardcode URLs, hosts, IPs or credentials.** Read them from env vars (`process.env.X` / `os.environ["X"]`), add the name to `.env.example`, and document it. Stable public docs/schema links are fine; add new ones to `urls.allowHosts` in `.github/guards/config.json` only with a reason in the PR.
- **Source code only.** Never commit downloads, PDFs, archives, binaries, build output, `node_modules`, databases, logs or large images. Link to them instead.
- **No personal data** in code, fixtures or logs. Use `@example.com` emails and `555-01xx` phone numbers.
- **Run the checks before pushing:** `scripts/verify.sh` (the same guards, tests and linters CI runs) plus `__CHECK_CMD__`. Never use `--no-verify`, and never add a `guard:allow` comment, weaken `.github/guards/config.json`, `.gitleaks.toml`, or any workflow or hook unless the ticket asks for it. Those files trip `gate-tripwire` and need the owner's label.
- **Never add a third-party GitHub Action by tag.** Pin the full commit SHA with a `# vX.Y.Z` comment, and give every workflow `permissions: {}` or the least it needs.
