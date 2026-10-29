# Guards: what they check and how to tune them

| Guard | Where it runs | Blocks |
| ----- | ------------- | ------ |
| gitleaks (`.gitleaks.toml`) | CI `guards/secrets` (full history), `pre-commit` (staged) | API keys and tokens (AWS, GCP, Stripe, OpenAI, Anthropic, GitHub, Slack, Vercel, ...), private keys, high-entropy `*_SECRET=` values |
| `guards.mjs files` | CI `guards/guards`, `pre-commit`, `pre-push` | `.env*` (except `.env.example`), PDFs/Office docs, archives, executables, libraries, media, databases, key files, build/dependency dirs, unknown binaries, files > `maxFileBytes` (1 MiB), images > `maxImageBytes` (300 KB) |
| `guards.mjs urls` | same | `http(s)://` URLs whose host isn't in `urls.allowHosts` (outside docs), and anywhere (outside tests/examples): `localhost`/IP URLs, bare IPv4s, `*.internal`/`*.local`/`*.corp`/... hostnames |
| `guards.mjs pii` | same | Key material everywhere; outside test paths, real-looking emails (not `@example.com`, noreply, ...) and phone numbers |
| GitHub secret scanning + push protection | GitHub server side | Known provider tokens at push time. Free and on by default for **public** repos; private repos need GitHub Secret Protection (paid). `setup.sh --apply` turns them on where allowed. |

Templated URLs are ignored: anything containing `${...}`, `${{ }}`, `{{ }}`, `%s` or a `__PLACEHOLDER__`.

## Tuning (`.github/guards/config.json`)

- **A legitimate public URL in code** (an API's documented base URL, a JSON schema): add its host to `urls.allowHosts`. Subdomains match.
- **Fixture or vendored asset that must live in the repo**: add a glob to `files.allowPaths` (exempts it from the files guard only).
- **Test files that use `localhost`**: already allowed via `urls.internalAllowPaths`; add your e2e folder if it's elsewhere.
- **Team emails** (e.g. in `package.json` authors): add them to `pii.allowEmails` (globs like `*@yourco.com`).
- **One-off line**: put `guard:allow` in a comment on that line. Reviewers should challenge every one.
- **Lockfiles over 1 MiB**: listed in `files.sizeExemptPaths`.

Every change to the config is a process change: it trips `gate-tripwire` and needs the owner's `gate-change: approved` label.

Run it: `node tools/guards/guards.mjs [files|urls|pii|all] [--staged]`. It scans tracked files (`git ls-files`), so `git add` new files first.
