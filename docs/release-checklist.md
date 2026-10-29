# Release checklist

Copy into the release PR body (`chore(repo): release x.y.z`, `release/x.y.z` → `main`).

## Before opening the PR

- [ ] `release/x.y.z` cut from an up-to-date `origin/develop`
- [ ] Version bumped (package.json / pyproject / ...) following SemVer: breaking → major, `feat` → minor, `fix` → patch
- [ ] `CHANGELOG.md`: new `## [x.y.z] - YYYY-MM-DD` section, entries grouped Added / Changed / Fixed / Security
      (`git log --oneline origin/main..HEAD` lists the Conventional Commits to summarise)
- [ ] `scripts/verify.sh` and `__CHECK_CMD__` pass locally
- [ ] No open `security` issues or Dependabot alerts that should block the release

## PR

- [ ] All checks green (CI, guards, e2e/Lighthouse run because the base is `main`), `review-gate` green
- [ ] Preview deployment smoke-tested (Vercel: the PR's preview URL)
- [ ] Owner merges with a **merge commit** (not squash)

## After merge

- [ ] Tag: `git fetch && git tag -s vX.Y.Z origin/main -m "vX.Y.Z" && git push origin vX.Y.Z` (`-s` signs it; use `-a` if you don't sign)
- [ ] Release: `gh release create vX.Y.Z --verify-tag --notes-file <changelog section>` (or `--generate-notes`)
- [ ] Production deploy verified (Vercel: `main` = production), version visible in the app
- [ ] Back-merge: `chore/back-merge-x.y.z` from `origin/main` → PR into `develop` (merge commit)
- [ ] Close the milestone / tickets

## Signed commits and tags (recommended)

`git config --global gpg.format ssh && git config --global user.signingkey ~/.ssh/id_ed25519.pub && git config --global commit.gpgsign true && git config --global tag.gpgsign true`,
then add the same key on GitHub as a **Signing key**. Commits show "Verified"; rulesets on paid/public repos can require it.
