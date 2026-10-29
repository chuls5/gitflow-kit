# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through
[GitHub private vulnerability reporting](../../security/advisories/new) (Security → Advisories → Report a vulnerability),
or email `__SECURITY_EMAIL__`. We aim to acknowledge within 3 business days and to ship a fix or mitigation for
confirmed high-severity issues within 14 days, then credit you in the advisory (unless you prefer otherwise).

## Supported versions

Only the latest release on `main` receives security fixes (shipped as `hotfix/x.y.z`).

## What we do

- Secrets: gitleaks in CI and pre-commit, GitHub secret scanning + push protection (on by default for public repos),
  env vars for every credential and endpoint, `.env*` files blocked.
- Supply chain: third-party Actions pinned to commit SHAs, Dependabot with a 7-day cooldown, least-privilege workflow tokens,
  workflow linting (actionlint, zizmor), optional dependency review, CodeQL and release SBOMs.
- Process: every change goes through a PR with an agent review gate; changes to process files need the owner's sign-off.

## If a secret leaks

1. Revoke/rotate it at the provider **first** (a pushed secret is compromised, even if the commit is removed).
2. Remove it from the code and load it from an env var/secret store.
3. Check provider logs for misuse. Rewriting history is optional and only after rotation.
