// Parallel Planner with Review — four-phase orchestration loop
//
// This template drives a multi-phase workflow:
//   Phase 1 (Plan):             An opus agent analyzes open issues, builds a
//                               dependency graph, and outputs a <plan> JSON
//                               listing unblocked issues with branch names.
//   Phase 2 (Execute + Review): For each issue, a sandbox is created via
//                               createSandbox(). The implementer runs first
//                               (100 iterations). If it produces commits, a
//                               reviewer runs in the same sandbox on the same
//                               branch and emits an APPROVE/REQUEST_CHANGES
//                               verdict, then a cheap verifier agent re-runs
//                               typecheck + tests and emits PASS/FAIL. All
//                               issue pipelines run concurrently via
//                               Promise.allSettled().
//   Phase 3 (Gate):             A branch is mergeable only if the implementer
//                               signaled COMPLETE, the reviewer approved, and
//                               the verifier passed. Anything else is held
//                               back — the branch survives on disk and the
//                               next cycle resumes it (branch names are
//                               deterministic per issue).
//   Phase 4 (Merge):            A single agent merges all mergeable branches
//                               into the current branch and closes their
//                               issues.
//
// The outer loop repeats up to MAX_ITERATIONS times so that newly unblocked
// issues are picked up after each round of merges.
//
// Usage:
//   pnpm sandcastle
// (defined in package.json as "sandcastle": "tsx .sandcastle/main.mts")

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { z } from "zod";

// The planner emits its plan as JSON inside <plan> tags; Output.object extracts
// and validates it against this schema. We use Zod here, but any Standard
// Schema validator works just as well — Valibot, ArkType, etc. See
// https://standardschema.dev.
const planSchema = z.object({
  issues: z.array(
    z.object({ id: z.string(), title: z.string(), branch: z.string() }),
  ),
});

type PlannedIssue = z.infer<typeof planSchema>["issues"][number];

// What each per-issue pipeline resolves to. The gate in Phase 3 needs all
// three booleans to be true (plus at least one commit) before a branch is
// handed to the merger.
type PipelineResult = {
  issue: PlannedIssue;
  commits: { sha: string }[];
  implementComplete: boolean;
  reviewApproved: boolean;
  checksPassed: boolean;
};

// Verdict signals for the reviewer and verifier. sandbox.run() has no
// structured-output support (that's top-level run() only), so gates inside a
// sandbox communicate via completionSignal — the matched string comes back on
// the run result.
const REVIEW_VERDICTS = {
  approve: "<verdict>APPROVE</verdict>",
  requestChanges: "<verdict>REQUEST_CHANGES</verdict>",
} as const;

const VERIFY_VERDICTS = {
  pass: "<verdict>PASS</verdict>",
  fail: "<verdict>FAIL</verdict>",
} as const;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maximum number of plan→execute→merge cycles before stopping.
// Raise this if your backlog is large; lower it for a quick smoke-test run.
const MAX_ITERATIONS = 10;

// Cap on how many issues run concurrently in one cycle. Each issue spins up
// its own Docker container plus a ~90s clean `pnpm install`, and runs an opus
// implementer for up to 100 iterations — a wide-open backlog would saturate
// the machine and the token budget. The planner lists issues highest-priority
// first, so slicing keeps the most important ones.
const MAX_PARALLEL = 4;

// Dependency install hook for the EXECUTE/REVIEW phase only.
//
// This runs inside the per-issue isolated git worktree (createSandbox below),
// which starts WITHOUT node_modules — so this is a clean install: no existing
// modules to purge, no interactive "remove node_modules?" prompt. A full install
// of this pnpm monorepo takes ~90s, which exceeds sandcastle's 60s default hook
// timeout, so raise it via timeoutMs.
//
// Deliberately NOT applied to the planner: `sandcastle.run` bind-mounts the MAIN
// repo read-write (not an isolated worktree), and on macOS that node_modules is
// macOS-built. Running `pnpm install` there makes Linux-pnpm purge + rebuild your
// HOST node_modules through the mount (this is what unlinked tsx/@ai-hero earlier
// and threw ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY). The planner only reads
// issues to build a plan; it needs no dependencies, so it gets no install hook.
const installHooks = {
  sandbox: {
    onSandboxReady: [{ command: "pnpm install", timeoutMs: 300_000 }],
  },
};

// NOTE: we intentionally do NOT copy the host's node_modules into the worktree.
// The host is macOS and the sandbox is Linux; copying macOS-built binaries in
// only forces pnpm to purge and rebuild them. A clean install is correct here.

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  // -------------------------------------------------------------------------
  // Phase 1: Plan
  //
  // The planning agent (opus, for deeper reasoning) reads the open issue list,
  // builds a dependency graph, and selects the issues that can be worked in
  // parallel right now (i.e., no blocking dependencies on other open issues).
  //
  // It outputs a <plan> JSON block — Output.object parses and validates it.
  // -------------------------------------------------------------------------
  const plan = await sandcastle.run({
    // No install hook here — the planner mounts the MAIN repo read-write and
    // only needs to read issues; running pnpm install would corrupt the host
    // node_modules (see installHooks note above).
    sandbox: docker(),
    name: "planner",
    // One iteration is enough: the planner just needs to read and reason,
    // not write code. (Structured output requires maxIterations: 1.)
    maxIterations: 1,
    // Opus for planning: it runs once per cycle at 1 iteration, so it's cheap
    // relative to the implementers — and a missed dependency here costs a
    // whole cycle of merge conflicts.
    agent: sandcastle.claudeCode("claude-opus-4-8"),
    promptFile: "./.sandcastle/plan-prompt.md",
    // Extract and validate the <plan> JSON into a typed object. Throws
    // StructuredOutputError if the tag is missing, the JSON is malformed, or
    // validation fails — which aborts the loop.
    output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
  });

  const planned = plan.output.issues;
  const issues = planned.slice(0, MAX_PARALLEL);

  if (issues.length === 0) {
    // No unblocked work — either everything is done or everything is blocked.
    console.log("No unblocked issues to work on. Exiting.");
    break;
  }

  if (planned.length > issues.length) {
    console.log(
      `Planner selected ${planned.length} issue(s); working the top ${issues.length} (MAX_PARALLEL).`,
    );
  }

  console.log(
    `Planning complete. ${issues.length} issue(s) to work in parallel:`,
  );
  for (const issue of issues) {
    console.log(`  ${issue.id}: ${issue.title} → ${issue.branch}`);
  }

  // -------------------------------------------------------------------------
  // Phase 2: Execute + Review + Verify
  //
  // For each issue, create a sandbox via createSandbox() so the implementer,
  // reviewer, and verifier share the same sandbox instance per branch. The
  // implementer runs first; if it produces commits, the reviewer refines the
  // work and emits an APPROVE/REQUEST_CHANGES verdict, then a cheap verifier
  // agent re-runs typecheck + tests and emits PASS/FAIL. The verdicts feed
  // the merge gate below.
  //
  // Promise.allSettled means one failing pipeline doesn't cancel the others.
  // -------------------------------------------------------------------------

  const settled = await Promise.allSettled(
    issues.map(async (issue): Promise<PipelineResult> => {
      const sandbox = await sandcastle.createSandbox({
        branch: issue.branch,
        sandbox: docker(),
        hooks: installHooks,
      });

      try {
        // Run the implementer
        const implement = await sandbox.run({
          name: "implementer",
          maxIterations: 100,
          agent: sandcastle.claudeCode("claude-opus-4-8"),
          promptFile: "./.sandcastle/implement-prompt.md",
          promptArgs: {
            TASK_ID: issue.id,
            ISSUE_TITLE: issue.title,
            BRANCH: issue.branch,
          },
        });

        // The implementer only emits <promise>COMPLETE</promise> (the default
        // completion signal) when acceptance criteria are met and tests pass.
        // No signal after 100 iterations means the work is partial.
        const implementComplete = implement.completionSignal !== undefined;

        if (implement.commits.length === 0) {
          // Nothing to review, verify, or merge.
          return {
            issue,
            commits: [],
            implementComplete,
            reviewApproved: false,
            checksPassed: false,
          };
        }

        // The reviewer gets the issue id so it can check the diff against the
        // issue's acceptance criteria, not just polish style.
        const review = await sandbox.run({
          name: "reviewer",
          maxIterations: 1,
          agent: sandcastle.claudeCode("claude-opus-4-8"),
          promptFile: "./.sandcastle/review-prompt.md",
          promptArgs: {
            BRANCH: issue.branch,
            TASK_ID: issue.id,
            ISSUE_TITLE: issue.title,
          },
          completionSignal: [
            REVIEW_VERDICTS.approve,
            REVIEW_VERDICTS.requestChanges,
          ],
        });

        // Independent verification: a cheap agent re-runs typecheck + tests
        // after the reviewer's edits and reports the real exit codes. This
        // catches both reviewer-introduced breakage and implementers that
        // claimed COMPLETE without green tests.
        const verify = await sandbox.run({
          name: "verifier",
          maxIterations: 1,
          agent: sandcastle.claudeCode("claude-haiku-4-5-20251001"),
          promptFile: "./.sandcastle/verify-prompt.md",
          completionSignal: [VERIFY_VERDICTS.pass, VERIFY_VERDICTS.fail],
        });

        // Merge commits from both runs so the merge phase sees all of them.
        // Each sandbox.run() only returns commits from its own run. (The
        // verifier is read-only and never commits.)
        return {
          issue,
          commits: [...implement.commits, ...review.commits],
          implementComplete,
          reviewApproved: review.completionSignal === REVIEW_VERDICTS.approve,
          checksPassed: verify.completionSignal === VERIFY_VERDICTS.pass,
        };
      } finally {
        await sandbox.close();
      }
    }),
  );

  // Log any agents that threw (network error, sandbox crash, etc.).
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      console.error(
        `  ✗ ${issues[i]!.id} (${issues[i]!.branch}) failed: ${outcome.reason}`,
      );
    }
  }

  const results = settled.flatMap((outcome) =>
    outcome.status === "fulfilled" ? [outcome.value] : [],
  );

  // -------------------------------------------------------------------------
  // Phase 3: Gate
  //
  // Only branches that are complete, approved, and green get merged. Branches
  // with commits that fail any gate are held back — they live on in the repo
  // under their deterministic name, and the next cycle's implementer resumes
  // them (the issue stays open, so the planner re-selects it).
  // -------------------------------------------------------------------------
  const mergeable = results.filter(
    (r) =>
      r.commits.length > 0 &&
      r.implementComplete &&
      r.reviewApproved &&
      r.checksPassed,
  );

  const heldBack = results.filter(
    (r) => r.commits.length > 0 && !mergeable.includes(r),
  );

  for (const r of heldBack) {
    const reasons = [
      !r.implementComplete && "implementer did not signal COMPLETE",
      !r.reviewApproved && "reviewer did not approve",
      !r.checksPassed && "typecheck/tests did not pass",
    ]
      .filter(Boolean)
      .join("; ");
    console.log(
      `  ⏸ ${r.issue.branch} held back (${reasons}) — branch kept for the next cycle`,
    );
  }

  console.log(
    `\nExecution complete. ${mergeable.length} of ${results.length} branch(es) ready to merge:`,
  );
  for (const r of mergeable) {
    console.log(`  ${r.issue.branch}`);
  }

  if (mergeable.length === 0) {
    // All agents ran but nothing passed the gate — nothing to merge this
    // cycle. Held-back branches resume next iteration.
    console.log("No branches passed the gate. Nothing to merge.");
    continue;
  }

  // -------------------------------------------------------------------------
  // Phase 4: Merge
  //
  // One agent merges all mergeable branches into the current branch and
  // closes their issues. Conflict resolution happens here; anything too
  // entangled gets skipped and reported rather than guessed at.
  //
  // The {{BRANCHES}} and {{ISSUES}} prompt arguments are lists that the agent
  // uses to know which branches to merge and which issues to close.
  // -------------------------------------------------------------------------
  await sandcastle.run({
    // Like the planner, the merger runs via sandcastle.run, which bind-mounts the
    // MAIN repo read-write — so no install hook (it would purge/rebuild the host
    // node_modules on macOS). The merge itself (git) needs no dependencies.
    // On a macOS host the merger can't run the suite (Linux container, macOS
    // node_modules), which is why verification happens per-branch in Phase 2
    // and the merge prompt forbids touching node_modules entirely.
    sandbox: docker(),
    name: "merger",
    maxIterations: 1,
    agent: sandcastle.claudeCode("claude-opus-4-8"),
    promptFile: "./.sandcastle/merge-prompt.md",
    promptArgs: {
      // A markdown list of branch names, one per line.
      BRANCHES: mergeable.map((r) => `- ${r.issue.branch}`).join("\n"),
      // A markdown list of issue IDs and titles, one per line.
      ISSUES: mergeable
        .map((r) => `- ${r.issue.id}: ${r.issue.title}`)
        .join("\n"),
    },
  });

  console.log("\nBranches merged.");
}

console.log("\nAll done.");
