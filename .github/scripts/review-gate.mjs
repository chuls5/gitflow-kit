// review-gate: turn the review agents' verdict headings into a red/green check.
//
// Reviews here are posted as COMMENT reviews (the owner cannot approve their own PRs), so the
// verdict lives on line 1 of the body, e.g. "## Review: APPROVE", and line 2 may name the reviewed
// head as "Reviewed-SHA: <sha>". The format is defined in .claude/skills/review-pr/SKILL.md step 6;
// keep the two in sync.
//
// Library: evaluate() and selectReruns() are pure and are what tools/review-gate tests.
// CLI:     node review-gate.mjs <reviews.json> <commits.json> <runs.json>
//          env OWNER (only the owner's reviews count), OVERRIDE=1 (owner applied the override
//          label), BACK_MERGE=1 (eligible back-merge PR), PR_NUMBER, RUN_ID (this run).
//          Prints the summary, appends it to $GITHUB_STEP_SUMMARY, writes `verdict` and `rerun`
//          to $GITHUB_OUTPUT, and exits 1 when the gate fails.

import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const OVERRIDE_LABEL = "review-gate: override";
export const BACK_MERGE_PREFIX = "chore/back-merge-";

export const VERDICT_RE =
  /^## (Review|Re-review(?: \d+)?|Code review|Design-system review|Design re-review): (APPROVE|REQUEST CHANGES|COMMENT)\s*$/;
export const REVIEWED_SHA_RE = /^Reviewed-SHA: ([0-9a-f]{7,40})\s*$/;

/** Parse line 1 (verdict) and line 2 (optional Reviewed-SHA) of a review body. */
export function parseVerdict(body) {
  const [first = "", second = ""] = String(body ?? "").split(/\r?\n/);
  const m = VERDICT_RE.exec(first);
  if (!m) return null;
  const sha = REVIEWED_SHA_RE.exec(second);
  return {
    kind: m[1].startsWith("Design") ? "design" : "code",
    heading: m[1],
    verdict: m[2],
    ...(sha ? { reviewedSha: sha[1] } : {}),
  };
}

/** A true merge commit (more than one parent). A subject starting with "Merge" is not enough. */
export const isMergeCommit = (commit) => (commit.parents ?? []).length > 1;

/** True when a back-merge PR's head is fully contained in main (`compare main...head` ahead_by 0). */
export const isEligibleBackMerge = (headRef, aheadOfMain) =>
  String(headRef ?? "").startsWith(BACK_MERGE_PREFIX) && aheadOfMain === 0;

const short = (sha) => String(sha ?? "").slice(0, 7);

/**
 * Staleness by SHA: find the reviewed commit in the PR's ordered commit list; the review is fresh
 * only if every later commit is a true merge. A SHA not on the PR (force-push, rebase) is stale.
 */
function staleness(entry, commits) {
  const ref = entry.reviewedSha ?? entry.commitId ?? "";
  const idx = ref ? commits.findIndex((c) => String(c.sha ?? "").startsWith(ref)) : -1;
  if (idx === -1) {
    return {
      stale: true,
      why: `reviewed commit ${short(ref) || "?"} is not on the PR (force-push or rebase?)`,
    };
  }
  const newer = commits.slice(idx + 1).filter((c) => !isMergeCommit(c));
  if (newer.length === 0) return { stale: false, why: "" };
  return {
    stale: true,
    why: `commit(s) ${newer.map((c) => short(c.sha)).join(", ")} came after it`,
  };
}

/**
 * @param {Array} reviews  GitHub "list reviews for a pull request" items
 * @param {Array} commits  GitHub "list commits on a pull request" items, oldest first
 * @param {{ owner?: string, override?: boolean, backMerge?: boolean, prNumber?: number|string }} [options]
 *   owner: when set, only reviews by this login count.
 * @returns {{ pass: boolean, overridden: boolean, backMerge: boolean, reasons: string[], latest: object }}
 */
export function evaluate(reviews, commits, options = {}) {
  const { owner, override = false, backMerge = false, prNumber = "<n>" } = options;
  const latest = { code: null, design: null };

  for (const review of reviews ?? []) {
    if (review.state === "DISMISSED" || review.state === "PENDING" || !review.submitted_at)
      continue;
    if (owner && review.user?.login !== owner) continue;
    const parsed = parseVerdict(review.body);
    if (!parsed) continue;
    const at = Date.parse(review.submitted_at);
    const current = latest[parsed.kind];
    // Date only picks the latest review; the id breaks ties (ids increase).
    if (!current || at > current.at || (at === current.at && (review.id ?? 0) > current.id)) {
      latest[parsed.kind] = {
        ...parsed,
        at,
        submittedAt: review.submitted_at,
        id: review.id ?? 0,
        commitId: review.commit_id,
      };
    }
  }

  for (const entry of Object.values(latest)) {
    if (entry) Object.assign(entry, staleness(entry, commits ?? []));
  }

  if (backMerge) {
    return {
      pass: true,
      overridden: false,
      backMerge: true,
      reasons: [`Back-merge PR: every commit is already on main, so no review is needed.`],
      latest,
    };
  }

  const reasons = [];
  const hint = `Run \`/review-pr ${prNumber}\` to post a fresh review.`;
  if (!latest.code) {
    reasons.push(
      `No code review with a verdict heading on line 1 (e.g. "## Review: APPROVE"). ${hint}`,
    );
  } else if (latest.code.stale) {
    reasons.push(
      `The latest code review (${latest.code.submittedAt}) is stale: ${latest.code.why}. ${hint}`,
    );
  }
  for (const kind of ["code", "design"]) {
    const entry = latest[kind];
    if (entry?.verdict === "REQUEST CHANGES") {
      reasons.push(
        `The latest ${kind} review ("${entry.heading}", ${entry.submittedAt}) says REQUEST CHANGES. Fix the blocking findings, then run \`/review-pr ${prNumber}\` again.`,
      );
    }
  }

  const gatePass = reasons.length === 0;
  if (!gatePass && override) {
    return {
      pass: true,
      overridden: true,
      backMerge: false,
      reasons: [`Overridden by the "${OVERRIDE_LABEL}" label. Would have failed:`, ...reasons],
      latest,
    };
  }
  return { pass: gatePass, overridden: false, backMerge: false, reasons, latest };
}

/**
 * Which earlier runs of this workflow on the same head SHA to re-run, so every review-gate row
 * shows the current verdict: on pass the red ones, on fail the green ones, and cancelled ones
 * either way (a per-PR concurrency group cancels queued runs). Reruns re-fetch live data.
 */
export function selectReruns(runs, { pass, currentRunId }) {
  const wrong = pass ? ["failure", "timed_out", "startup_failure"] : ["success"];
  return (runs ?? [])
    .filter((r) => String(r.id) !== String(currentRunId) && r.status === "completed")
    .filter((r) => r.conclusion === "cancelled" || wrong.includes(r.conclusion))
    .map((r) => r.id);
}

/** Markdown summary for the job log and $GITHUB_STEP_SUMMARY. */
export function formatSummary(result) {
  const status = result.overridden
    ? "⚠️ PASS (override)"
    : result.backMerge
      ? "✅ PASS (back-merge)"
      : result.pass
        ? "✅ PASS"
        : "❌ FAIL";
  const rows = ["code", "design"].map((kind) => {
    const e = result.latest[kind];
    if (!e) return `| ${kind} | none | | | | |`;
    const sha = short(e.reviewedSha ?? e.commitId) + (e.reviewedSha ? " (Reviewed-SHA)" : "");
    return `| ${kind} | ${e.heading} | ${e.verdict} | ${e.submittedAt} | ${sha} | ${e.stale ? `yes: ${e.why}` : "no"} |`;
  });
  return [
    `## review-gate: ${status}`,
    "",
    "| Type | Latest heading | Verdict | Submitted | Reviewed commit | Stale |",
    "| ---- | -------------- | ------- | --------- | --------------- | ----- |",
    ...rows,
    "",
    ...result.reasons.map((r) => `- ${r}`),
    "",
  ].join("\n");
}

function main([reviewsPath, commitsPath, runsPath]) {
  // `gh api --paginate --slurp` yields an array of pages; flatten either shape.
  const load = (p) => JSON.parse(readFileSync(p, "utf8")).flat();
  const { env } = process;
  const result = evaluate(load(reviewsPath), load(commitsPath), {
    owner: env.OWNER || undefined,
    override: env.OVERRIDE === "1",
    backMerge: env.BACK_MERGE === "1",
    prNumber: env.PR_NUMBER,
  });
  const runs = runsPath
    ? JSON.parse(readFileSync(runsPath, "utf8")).flatMap((p) => p.workflow_runs ?? p)
    : [];
  const rerun = selectReruns(runs, { pass: result.pass, currentRunId: env.RUN_ID });

  const summary = formatSummary(result);
  console.log(summary);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary);
  if (env.GITHUB_OUTPUT) {
    appendFileSync(
      env.GITHUB_OUTPUT,
      `verdict=${result.pass ? "pass" : "fail"}\nrerun=${rerun.join(" ")}\n`,
    );
  }
  if (result.overridden)
    console.log(`::warning::review-gate overridden by the "${OVERRIDE_LABEL}" label`);
  if (!result.pass) {
    for (const r of result.reasons) console.log(`::error::${r}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
