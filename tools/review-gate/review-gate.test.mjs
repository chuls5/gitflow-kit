// Tests for .github/scripts/review-gate.mjs. Run with: node --test "tools/review-gate/*.test.mjs"
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluate,
  formatSummary,
  isEligibleBackMerge,
  parseVerdict,
  selectReruns,
  VERDICT_RE,
} from "../../.github/scripts/review-gate.mjs";

const OWNER = "repo-owner"; // fixture login; the gate itself reads OWNER from the repo
let nextId = 1;
const review = (body, at, commitId, extra = {}) => ({
  id: nextId++,
  state: "COMMENTED",
  user: { login: OWNER },
  body,
  submitted_at: at,
  commit_id: commitId,
  ...extra,
});
const commit = (
  sha,
  { parents = 1, message = "feat(web): change", date = "2026-10-01T00:00:00Z" } = {},
) => ({
  sha,
  parents: Array.from({ length: parents }, (_, i) => ({ sha: `p${i}` })),
  commit: { message, committer: { date } },
});
const run = (id, conclusion, status = "completed") => ({ id, status, conclusion });

const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);
const T1 = "2026-10-29T05:00:00Z";
const T2 = "2026-10-29T06:00:00Z";
const T3 = "2026-10-29T07:00:00Z";
const one = [commit(A)];
const opts = { owner: OWNER };

test("parses every sanctioned heading on line 1", () => {
  assert.deepEqual(parseVerdict("## Review: APPROVE\n**Checks:** …"), {
    kind: "code",
    heading: "Review",
    verdict: "APPROVE",
  });
  assert.equal(parseVerdict("## Re-review: COMMENT").verdict, "COMMENT");
  assert.equal(parseVerdict("## Re-review 2: REQUEST CHANGES  ").verdict, "REQUEST CHANGES");
  assert.equal(parseVerdict("## Code review: APPROVE\r\nbody").kind, "code");
  assert.equal(parseVerdict("## Design-system review: REQUEST CHANGES").kind, "design");
  assert.equal(parseVerdict("## Design re-review: APPROVE").kind, "design");
});

test("rejects loose or off-format headings", () => {
  for (const h of [
    "## Review: good to merge after a rebase",
    "Review of #16 (comment only)",
    "## Review: APPROVED",
    "## Reviewer notes: APPROVE",
    "## Review: COMMENT on later",
    "## Re-review: approve",
    "##  Review: APPROVE",
    "## Review:APPROVE",
    "## Review — APPROVE",
    "Thanks!\n\n## Review: APPROVE",
    "# Notes\n## Review: APPROVE",
  ]) {
    assert.equal(parseVerdict(h), null, h);
  }
});

test("reads Reviewed-SHA from line 2 only", () => {
  assert.equal(parseVerdict(`## Review: APPROVE\nReviewed-SHA: ${A}`).reviewedSha, A);
  assert.equal(parseVerdict("## Review: APPROVE\nReviewed-SHA: abc1234").reviewedSha, "abc1234");
  assert.equal(parseVerdict(`## Review: APPROVE\n\nReviewed-SHA: ${A}`).reviewedSha, undefined);
});

test("approve of the head commit passes", () => {
  const r = evaluate([review("## Review: APPROVE", T1, A)], one, opts);
  assert.equal(r.pass, true);
  assert.deepEqual(r.reasons, []);
});

test("latest review REQUEST CHANGES fails even after an earlier approve", () => {
  const r = evaluate(
    [review("## Review: APPROVE", T1, A), review("## Re-review: REQUEST CHANGES", T2, A)],
    one,
    { ...opts, prNumber: 18 },
  );
  assert.equal(r.pass, false);
  assert.match(r.reasons.join("\n"), /REQUEST CHANGES/);
  assert.match(r.reasons.join("\n"), /\/review-pr 18/);
});

test("a later approve clears an earlier REQUEST CHANGES", () => {
  const r = evaluate(
    [review("## Review: REQUEST CHANGES", T1, A), review("## Re-review 2: APPROVE", T2, A)],
    one,
    opts,
  );
  assert.equal(r.pass, true);
});

test("a push after the reviewed commit makes it stale", () => {
  const r = evaluate([review("## Review: APPROVE", T1, A)], [commit(A), commit(B)], opts);
  assert.equal(r.pass, false);
  assert.equal(r.latest.code.stale, true);
  assert.match(r.reasons[0], /bbbbbbb/);
});

test("a backdated commit pushed after the review is still stale (SHA, not dates)", () => {
  const backdated = commit(B, { date: "2020-01-01T00:00:00Z" });
  const r = evaluate([review("## Review: APPROVE", T1, A)], [commit(A), backdated], opts);
  assert.equal(r.pass, false);
});

test("only true merge commits after the review keep it fresh", () => {
  const merge = commit(B, { parents: 2, message: "Merge remote-tracking branch 'origin/develop'" });
  const r = evaluate([review("## Review: APPROVE", T1, A)], [commit(A), merge], opts);
  assert.equal(r.pass, true);
});

test("a one-parent commit whose subject starts with Merge is stale", () => {
  for (const message of ["Mergesort: rewrite", "Merge branch 'develop' into feat/x"]) {
    const r = evaluate(
      [review("## Review: APPROVE", T1, A)],
      [commit(A), commit(B, { message })],
      opts,
    );
    assert.equal(r.pass, false, message);
  }
});

test("a reviewed commit missing from the PR (force-push/rebase) is stale", () => {
  const r = evaluate([review("## Review: APPROVE", T1, C)], [commit(A), commit(B)], opts);
  assert.equal(r.pass, false);
  assert.match(r.reasons[0], /not on the PR/);
});

test("Reviewed-SHA wins over commit_id: a push during the review is stale", () => {
  // The reviewer read A; B landed before `gh pr review`, so commit_id is B.
  const r = evaluate(
    [review(`## Review: APPROVE\nReviewed-SHA: ${A}`, T1, B)],
    [commit(A), commit(B)],
    opts,
  );
  assert.equal(r.pass, false);
  assert.match(r.reasons[0], /bbbbbbb/);
});

test("Reviewed-SHA of the head passes, short SHAs included", () => {
  const r = evaluate(
    [review("## Review: APPROVE\nReviewed-SHA: bbbbbbb", T1, B)],
    [commit(A), commit(B)],
    opts,
  );
  assert.equal(r.pass, true);
  assert.match(formatSummary(r), /Reviewed-SHA/);
});

test("COMMENT-only review passes", () => {
  const r = evaluate([review("## Review: COMMENT", T1, A)], one, opts);
  assert.equal(r.pass, true);
});

test("design REQUEST CHANGES blocks even when a newer code review approves", () => {
  const r = evaluate(
    [
      review("## Design-system review: REQUEST CHANGES", T1, A),
      review("## Code review: APPROVE", T2, A),
    ],
    one,
    opts,
  );
  assert.equal(r.pass, false);
  assert.match(r.reasons.join("\n"), /latest design review/);
});

test("a design review alone is not enough", () => {
  const r = evaluate([review("## Design-system review: APPROVE", T1, A)], one, opts);
  assert.equal(r.pass, false);
  assert.match(r.reasons[0], /No code review/);
});

test("no reviews fails", () => {
  const r = evaluate([], one, { ...opts, prNumber: 7 });
  assert.equal(r.pass, false);
  assert.match(r.reasons[0], /\/review-pr 7/);
});

test("non-verdict, dismissed and non-owner reviews are ignored", () => {
  const r = evaluate(
    [
      review("## Review: APPROVE", T1, A),
      review("## Review: REQUEST CHANGES", T2, A, { state: "DISMISSED" }),
      review("## Review: good to merge after a rebase", T3, A),
    ],
    one,
    opts,
  );
  assert.equal(r.pass, true);
  const stranger = evaluate(
    [review("## Review: APPROVE", T1, A, { user: { login: "someone" } })],
    one,
    opts,
  );
  assert.equal(stranger.pass, false);
});

test("same-second reviews: the higher id is the latest", () => {
  const r = evaluate(
    [
      review("## Review: APPROVE", T1, A, { id: 10 }),
      review("## Review: REQUEST CHANGES", T1, A, { id: 11 }),
    ],
    one,
    opts,
  );
  assert.equal(r.pass, false);
});

test("override label passes a failing gate with a warning", () => {
  const r = evaluate([review("## Review: REQUEST CHANGES", T1, A)], one, {
    ...opts,
    override: true,
  });
  assert.equal(r.pass, true);
  assert.equal(r.overridden, true);
  assert.match(r.reasons[0], /override/);
  assert.match(formatSummary(r), /PASS \(override\)/);
});

test("override is a no-op on a passing gate", () => {
  const r = evaluate([review("## Review: APPROVE", T1, A)], one, { ...opts, override: true });
  assert.equal(r.pass, true);
  assert.equal(r.overridden, false);
});

test("back-merge eligibility needs the prefix and nothing ahead of main", () => {
  assert.equal(isEligibleBackMerge("chore/back-merge-0.1.0", 0), true);
  assert.equal(isEligibleBackMerge("chore/back-merge-0.1.0", 1), false);
  assert.equal(isEligibleBackMerge("chore/other", 0), false);
  assert.equal(isEligibleBackMerge("chore/back-merge-0.1.0", undefined), false);
  const r = evaluate([], one, { ...opts, backMerge: true });
  assert.equal(r.pass, true);
  assert.match(formatSummary(r), /back-merge/);
});

test("selectReruns: on pass re-run red and cancelled runs, never this run", () => {
  const runs = [
    run(1, "failure"),
    run(2, "success"),
    run(3, "cancelled"),
    run(4, "failure"),
    run(5, null, "in_progress"),
    run(6, "timed_out"),
  ];
  assert.deepEqual(selectReruns(runs, { pass: true, currentRunId: 4 }), [1, 3, 6]);
});

test("selectReruns: on fail re-run green and cancelled runs", () => {
  const runs = [run(1, "failure"), run(2, "success"), run(3, "cancelled"), run(4, "success")];
  assert.deepEqual(selectReruns(runs, { pass: false, currentRunId: "4" }), [2, 3]);
  assert.deepEqual(selectReruns([], { pass: false, currentRunId: 1 }), []);
});

test("summary has a table row per review type", () => {
  const s = formatSummary(evaluate([review("## Review: APPROVE", T1, A)], one, opts));
  assert.match(s, /\| code \| Review \| APPROVE \|/);
  assert.match(s, /\| design \| none \|/);
});

test("docs/git-flow.md quotes the regex exactly", async () => {
  const { readFile } = await import("node:fs/promises");
  const doc = await readFile(new URL("../../docs/git-flow.md", import.meta.url), "utf8");
  assert.ok(doc.includes(`\n${VERDICT_RE.source}\n`), "update the regex in docs/git-flow.md");
});
