// Guards .github/workflows/review-gate.yml (audit #26 CI-01): the gate must run its logic from the
// PR's BASE commit, so a PR that rewrites review-gate.mjs (e.g. to `exit 0`) cannot pass its own gate.
// Run with: node --test "tools/review-gate/*.test.mjs"
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workflow = await readFile(
  new URL("../../.github/workflows/review-gate.yml", import.meta.url),
  "utf8",
);

/** The text of one top-level job (from `  <name>:` to the next two-space-indented key). */
function job(name) {
  const lines = workflow.split("\n");
  const start = lines.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `job ${name} not found`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}[\w-]+:/.test(l));
  return rest.slice(0, end === -1 ? undefined : end).join("\n");
}

const gate = job("review-gate");

test("review-gate checks out the base commit, and only the base commit", () => {
  const checkouts = gate.match(/uses: actions\/checkout@/g) ?? [];
  assert.equal(checkouts.length, 1, "the review-gate job must have exactly one checkout");
  assert.match(gate, /^\s+ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}\s*$/m);
  assert.doesNotMatch(gate, /ref: \$\{\{ github\.(head_ref|sha|event\.pull_request\.head\.)/);
});

test("review-gate runs the gate script and tests from that checkout", () => {
  assert.match(gate, /node --test "tools\/review-gate\/\*\.test\.mjs"/);
  assert.match(gate, /node \.github\/scripts\/review-gate\.mjs /);
  assert.match(gate, /persist-credentials: false/);
});

test("the head-checkout test job cannot affect the verdict", () => {
  const tests = job("gate-logic-tests");
  assert.doesNotMatch(tests, /review-gate\.mjs "\$RUNNER_TEMP/, "it must not run the gate CLI");
  assert.doesNotMatch(job("review-gate-sync"), /gate-logic-tests/);
  assert.doesNotMatch(gate, /needs:/, "review-gate must not depend on the head-checkout job");
});
