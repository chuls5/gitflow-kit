// commitlint config matching .githooks/commit-msg and pr-lint.yml. Optional: the hook works without Node deps.
// Use: npx --yes @commitlint/cli@20 --from origin/develop  (or wire it into CI / a husky hook).
// KIT: keep scopes in sync with .githooks/commit-msg, .gitmessage, pr-lint.yml and CONTRIBUTING.md.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']],
    'scope-enum': [2, 'always', ['app', 'api', 'db', 'auth', 'deps', 'ci', 'docs', 'tools', 'repo']],
    'subject-case': [2, 'always', 'lower-case'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 72],
  },
};
