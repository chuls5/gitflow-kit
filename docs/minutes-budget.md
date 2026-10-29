# Actions minutes budget

Private repos on the free plan get **2,000 Actions minutes/month** (public repos are unlimited). Every job is billed
rounded **up** to the whole minute, so many tiny jobs cost more than they look. A busy agent night can burn the month.

What the kit already does:

- `concurrency` with `cancel-in-progress: true` on lint, guards, pr-lint and CI: a new push cancels the old run.
  (review-gate keeps `false` on purpose so verdict rows don't get cancelled; its sync job handles the rest.)
- `timeout-minutes` on every job so a hang can't eat hours.
- `paths-ignore` for docs-only changes on lint/CI/e2e/CodeQL.
- e2e and Lighthouse run only on PRs into `main`, on PRs labelled `run-e2e`, and on pushes to `main`.
- `stale` runs once a week; Dependabot is weekly, grouped, with a 7-day cooldown and a PR limit.

More levers if you're still tight:

- Ask agents to batch fixes into one push instead of many small ones (each push re-runs every check).
- Drop `push` triggers on `develop` for jobs the PR already ran (the merged result is the same for squash merges).
- Run `scripts/verify.sh` locally before pushing so CI isn't the first place failures show up.
- Check usage: Settings → Billing → Usage, or `gh api /users/<you>/settings/billing/usage`.
- When the limit is hit, every job fails at once with "recent account payments have failed or your spending limit needs to be increased". Either wait for the monthly reset, set a small spending limit, or make the repo public if it can be.
