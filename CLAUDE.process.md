<!-- KIT: paste this section into the project's CLAUDE.md and AGENTS.md (agents read one or the other). -->
## Workflow

Follow [CONTRIBUTING.md](CONTRIBUTING.md): a branch per ticket, stay inside the ticket's **Touches** paths, run `__CHECK_CMD__`,
write Conventional Commits, open a PR whose title is a Conventional Commit, then run `/review-pr <n>`
(the reviewer agents). This is Git flow: branch from and PR into `develop`; only `release/*` and `hotfix/*` go to `main`.
Never commit or push to `main` or `develop`, and never merge: the owner merges.

When a review asks for changes, fix every blocking finding in new commits (don't force-push over review history), push,
and ask for a re-review. Review bodies start with `## Review: <APPROVE|REQUEST CHANGES|COMMENT>` on line 1 and
`Reviewed-SHA: <head sha>` on line 2, because the `review-gate` check machine-reads them.
