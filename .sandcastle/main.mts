// Parallel Planner with Review — multi-phase orchestration loop
//
// This template drives a multi-phase workflow:
//   Phase 1 (Plan):             The script first asks GitHub whether any
//                               ready-for-agent issues exist at all (a drained
//                               backlog must not cost a model call). Then an
//                               opus agent analyzes open issues, builds a
//                               dependency graph, and outputs a <plan> JSON
//                               listing unblocked issues with branch names.
//   Phase 2 (Design + Execute + Review):
//                               For each issue, a sandbox is created via
//                               createSandbox(). An opus architect explores
//                               the code (via the graphify code graph built in
//                               the sandbox hook) and posts a design to the
//                               issue; a sonnet implementer executes that
//                               design (up to 100 iterations), with escape
//                               signals for when the design collides with
//                               reality (NEEDS_ARCHITECT) or the work waits
//                               on another open issue or missing
//                               infrastructure (BLOCKED). If it commits
//                               and signals COMPLETE, an opus reviewer emits
//                               an APPROVE/REQUEST_CHANGES verdict, then a
//                               cheap verifier re-runs typecheck + tests and
//                               emits PASS/FAIL. All issue pipelines run
//                               concurrently via Promise.allSettled().
//   Phase 3 (Gate):             A branch is mergeable only if the implementer
//                               signaled COMPLETE, the reviewer approved, the
//                               verifier passed, AND a deterministic
//                               test-integrity diff finds no deleted test
//                               files or added skip/todo markers (a gamed
//                               suite passes the verifier trivially). Anything
//                               else is held back — the branch survives on
//                               disk and the next cycle resumes it (branch
//                               names are deterministic per issue). Anti-
//                               livelock rules: an ALREADY_SATISFIED issue is
//                               closed by the orchestrator; a COMPLETE claim
//                               with no work to merge is parked (ready-for-
//                               agent → needs-triage); every other held-back
//                               cycle posts a failure-marker comment, and
//                               MAX_ATTEMPTS such failures park the issue too
//                               (churn — commits without merges — never trips
//                               the zero-activity breaker below). A cycle that
//                               merges nothing, commits nothing, and
//                               closes/parks nothing stops the loop — its
//                               rerun would be identical.
//   Phase 4 (Merge):            The orchestrator itself merges each mergeable
//                               branch into the current branch — a script, not
//                               an agent: merging and issue-closing are
//                               deterministic, and conflicted branches are
//                               skipped rather than resolved (the next cycle's
//                               implementer resolves them in-branch, where the
//                               test suite runs). The merged result is then
//                               verified on the HOST; a red merged base stops
//                               the loop. Merges stay local — pushing is left
//                               to the human on purpose.
//
// The outer loop repeats up to MAX_ITERATIONS times so that newly unblocked
// issues are picked up after each round of merges.
//
// Usage:
//   pnpm sandcastle                  # defaults: 4 issues per cycle, 10 cycles
//   pnpm sandcastle --parallel 2     # take only the top 2 issues per cycle
//   pnpm sandcastle -p 1 -i 1        # one issue, one cycle — slow mode
//   SANDCASTLE_MAX_TOKENS=20000000 pnpm sandcastle
//                                    # optional token budget for the run;
//                                    # checked at cycle boundaries only
// (defined in package.json as "sandcastle": "tsx .sandcastle/main.mts";
// pnpm forwards flags after the script name straight to the script)
//
// Every run appends to .sandcastle/RUN_LOG.md (gitignored): a header line per
// run and one line per cycle — planned/merged/skipped/closed/held issues and
// token usage — so an overnight run is skimmable without opening per-role logs.

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execFileSync, execSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
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
// three booleans to be true (and the branch to be ahead of the base) before a
// branch is handed to the merger. `note` explains an early exit (architect
// blocked, NEEDS_ARCHITECT, not COMPLETE) so the cycle report can say why.
type PipelineResult = {
  issue: PlannedIssue;
  commits: { sha: string }[];
  implementComplete: boolean;
  reviewApproved: boolean;
  checksPassed: boolean;
  // The implementer proved the acceptance criteria are already met by
  // existing code — the orchestrator closes the issue instead of gating it.
  alreadySatisfied?: boolean;
  note?: string;
  // Token usage summed across every stage this pipeline ran — feeds the
  // per-cycle run-ledger line and the optional token ceiling.
  tokens: TokenTally;
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

// The architect either posts an executable design to the issue (READY) or
// declares the issue undesignable (BLOCKED — it comments and swaps the
// ready-for-agent label for needs-info so the planner stops selecting it).
const ARCHITECT_VERDICTS = {
  ready: "<design>READY</design>",
  blocked: "<design>BLOCKED</design>",
} as const;

// The implementer's four exits: COMPLETE (acceptance criteria met, checks
// green, work committed), NEEDS_ARCHITECT (the design collided with
// reality — punt back to the architect next cycle instead of letting the
// cheaper model improvise a redesign), ALREADY_SATISFIED (the criteria
// are already met by existing code, nothing to implement — the orchestrator
// closes the issue; without this exit a no-op issue livelocks: COMPLETE with
// zero commits can never become ahead of base, so it is re-selected forever),
// or BLOCKED (an acceptance criterion depends on another open issue or on
// infrastructure the sandbox lacks — without this exit a blocked issue spins
// the whole iteration budget re-confirming its blocker, posting a status
// comment per iteration; observed: 84 near-identical "still blocked"
// comments and ~100 wasted implementer runs on one issue).
const IMPLEMENT_SIGNALS = {
  complete: "<promise>COMPLETE</promise>",
  needsArchitect: "<promise>NEEDS_ARCHITECT</promise>",
  alreadySatisfied: "<promise>ALREADY_SATISFIED</promise>",
  blocked: "<promise>BLOCKED</promise>",
} as const;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const { values: flags } = parseArgs({
  options: {
    parallel: { type: "string", short: "p" },
    iterations: { type: "string", short: "i" },
  },
});

function positiveInt(name: string, raw: string | undefined, fallback: number) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    console.error(`--${name} must be a positive integer, got "${raw}"`);
    process.exit(1);
  }
  return value;
}

// Maximum number of plan→execute→merge cycles before stopping (--iterations).
// Raise this if your backlog is large; lower it for a quick smoke-test run.
const MAX_ITERATIONS = positiveInt("iterations", flags.iterations, 10);

// Cap on how many issues run concurrently in one cycle (--parallel). Each
// issue spins up its own Docker container plus a ~90s clean `pnpm install`,
// and runs an opus implementer for up to 100 iterations — a wide-open backlog
// would saturate the machine and the token budget. The planner lists issues
// highest-priority first, so slicing keeps the most important ones.
const MAX_PARALLEL = positiveInt("parallel", flags.parallel, 4);

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
    onSandboxReady: [
      { command: "pnpm install", timeoutMs: 300_000 },
      // Build the tree-sitter code graph the architect queries. Token-free:
      // .graphifyignore keeps the corpus code-only, so no LLM key is needed,
      // and graphify-out/ is gitignored so it never reaches the merger.
      // Tolerant on purpose (|| echo): a failed graph build must not kill the
      // pipeline — the architect prompt falls back to manual exploration when
      // graph.json is missing.
      {
        command:
          "bash -c 'graphify extract . || echo \"graphify build failed - architect will explore manually\"'",
        timeoutMs: 300_000,
      },
    ],
  },
};

// NOTE: we intentionally do NOT copy the host's node_modules into the worktree.
// The host is macOS and the sandbox is Linux; copying macOS-built binaries in
// only forces pnpm to purge and rebuild them. A clean install is correct here.

// A crash during a previous run's merge phase can leave the MAIN repo
// mid-merge (MERGE_HEAD + conflict markers in the working tree). The planner
// and merger bind-mount that repo directly, so running on top of that state
// is undefined behavior — stop and let the human decide (usually
// `git merge --abort`). Checked at the top of every cycle, not just at boot,
// because the merger runs at the end of each one.
function assertRepoNotMidMerge() {
  try {
    execSync("git rev-parse -q --verify MERGE_HEAD", { stdio: "ignore" });
  } catch {
    return; // MERGE_HEAD doesn't resolve — no merge in progress.
  }
  console.error(
    "The repository is mid-merge (MERGE_HEAD exists) — likely a previous " +
      "run died during the merge phase. Inspect the state and resolve it " +
      "(usually `git merge --abort`), then re-run.",
  );
  process.exit(1);
}

// Whether a branch carries any commit the target branch (HEAD) doesn't already
// have. The merge gate must NOT depend on how many commits the CURRENT
// implementer run produced: a branch fully finished in a PRIOR cycle resumes
// with its work already committed, so its implementer re-affirms COMPLETE while
// adding zero new commits — yet it is still perfectly mergeable. Gating on
// this-run commits stranded such branches forever (the classic symptom: the
// same "last issue" is re-selected every cycle, its implementer says COMPLETE,
// and it's held back with "produced no commits"). Asked of git on the HOST,
// where the branch ref survives sandbox.close() and where the merge happens.
function branchIsAheadOfBase(branch: string): boolean {
  try {
    const count = execFileSync(
      "git",
      ["rev-list", "--count", `HEAD..${branch}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return Number(count) > 0;
  } catch {
    // Branch ref missing (never created, or pruned) — nothing to merge.
    return false;
  }
}

// How many issues the planner would even see. plan-prompt.md interpolates this
// same query at prompt-build time; asking first from the script means a
// drained backlog costs one `gh` call instead of an opus planner run — the
// model was previously invoked even on an empty `[]` list.
function readyForAgentCount(): number {
  const out = execFileSync(
    "gh",
    [
      "issue",
      "list",
      "--state",
      "open",
      "--label",
      "ready-for-agent",
      "--limit",
      "100",
      "--json",
      "number",
      "--jq",
      "length",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();
  return Number(out) || 0;
}

// ---------------------------------------------------------------------------
// Loop accounting: token tallies, run ledger, budget ceiling
// ---------------------------------------------------------------------------

type TokenTally = { input: number; cacheRead: number; output: number };

const zeroTokens = (): TokenTally => ({ input: 0, cacheRead: 0, output: 0 });

// Sum a run result's per-iteration usage into a tally. `input` folds in cache
// WRITES (billed like input); cache READS are tracked separately — they are an
// order of magnitude cheaper and dominate loop traffic, so folding them into
// input would make every cycle look far more expensive than it is.
function addTokens(
  tally: TokenTally,
  run: {
    iterations: ReadonlyArray<{
      usage?: {
        inputTokens: number;
        cacheCreationInputTokens: number;
        cacheReadInputTokens: number;
        outputTokens: number;
      };
    }>;
  },
): void {
  for (const it of run.iterations) {
    if (!it.usage) continue;
    tally.input += it.usage.inputTokens + it.usage.cacheCreationInputTokens;
    tally.cacheRead += it.usage.cacheReadInputTokens;
    tally.output += it.usage.outputTokens;
  }
}

function foldTokens(into: TokenTally, from: TokenTally): void {
  into.input += from.input;
  into.cacheRead += from.cacheRead;
  into.output += from.output;
}

const totalTokens = (t: TokenTally) => t.input + t.cacheRead + t.output;

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

const fmtTokens = (t: TokenTally) =>
  `in=${compact(t.input)} cacheR=${compact(t.cacheRead)} out=${compact(t.output)}`;

// One line per cycle appended to a host-local, gitignored ledger so an
// overnight run's shape (what merged, parked, churned, cost) is skimmable in
// seconds and /retro can ingest it — instead of reconstructing the run from
// per-role logs after the fact.
const RUN_LOG = "./.sandcastle/RUN_LOG.md";

function runLog(line: string): void {
  try {
    appendFileSync(RUN_LOG, line + "\n");
  } catch {
    // Logging must never kill the loop.
  }
}

// Optional token budget for the whole run (sum of input + cache-read + output
// across every agent). 0 = unbounded. Checked at cycle boundaries only, so a
// merge-and-verify always finishes cleanly — the ceiling stops the NEXT lap,
// it never corrupts the current one. Without any budget the practical
// backstop is the subscription rate limit, hit blind mid-cycle.
const TOKEN_CEILING = Number(process.env.SANDCASTLE_MAX_TOKENS) || 0;

// ---------------------------------------------------------------------------
// Per-issue attempt cap and test-integrity gate
// ---------------------------------------------------------------------------

// Bounded retry, then escalate to a human (12-factor agents, factor 9): a
// churning issue — new commits every cycle, but review or verify keeps
// failing — never trips the no-progress breaker (which only sees zero-commit
// cycles) and would otherwise be re-selected until MAX_ITERATIONS.
const MAX_ATTEMPTS = 3;
const FAILED_CYCLE_MARKER = "<!-- sandcastle:failed-cycle -->";

// How many cycles have already failed on this issue, counted from the
// orchestrator's own marker comments. GitHub comments are the
// cross-invocation store — the same reasoning as deterministic branch names:
// state that must survive the process lives outside it.
function failedCycleCount(issueId: string): number {
  try {
    const out = execFileSync(
      "gh",
      [
        "issue",
        "view",
        issueId,
        "--json",
        "comments",
        "--jq",
        `[.comments[].body | select(startswith("${FAILED_CYCLE_MARKER}"))] | length`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return Number(out) || 0;
  } catch {
    return 0;
  }
}

// Swap ready-for-agent → needs-triage and explain why, so the planner's label
// filter stops selecting the issue and a human triages with the failure trail
// already on the issue.
function parkIssue(issueId: string, body: string): boolean {
  try {
    execFileSync(
      "gh",
      [
        "issue",
        "edit",
        issueId,
        "--remove-label",
        "ready-for-agent",
        "--add-label",
        "needs-triage",
      ],
      { stdio: "pipe" },
    );
    execFileSync("gh", ["issue", "comment", issueId, "--body", body], {
      stdio: "pipe",
    });
    return true;
  } catch {
    console.error(
      `  ⚠ #${issueId} should be parked but the label swap failed — do it ` +
        `manually (create the label first if missing): ` +
        `gh issue edit ${issueId} --remove-label ready-for-agent --add-label needs-triage`,
    );
    return false;
  }
}

// Test files by this repo's conventions: *.test.* / *.spec.* / __tests__/ and
// test(s)/ directories.
const TEST_FILE_RE = /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
// Added lines that disable tests: it.skip / describe.skip / test.todo / xit(…
const SKIP_MARKER_RE =
  /\b(?:it|test|describe)\s*\.\s*(?:skip|todo)\s*\(|\bx(?:it|test|describe)\s*\(/;

// The documented gaming failure mode: an implementer that quietly deletes or
// skips tests it couldn't fix produces a branch where typecheck+tests pass —
// the verifier re-runs the suite but cannot see what's missing from it. This
// is the deterministic guard: diff the branch against its merge base
// (HEAD...branch) and refuse to merge when test files were deleted or
// skip/todo markers were added. Renames don't count (-M). A violation holds
// the branch back and counts as a failed cycle, so the attempt cap eventually
// escalates repeat offenders to a human.
function testIntegrityViolations(branch: string): string[] {
  const violations: string[] = [];
  try {
    const status = execFileSync(
      "git",
      ["diff", "--name-status", "-M", `HEAD...${branch}`],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    for (const line of status.split("\n")) {
      const [code, path] = line.split("\t");
      if (code?.startsWith("D") && path && TEST_FILE_RE.test(path)) {
        violations.push(`deleted test file: ${path}`);
      }
    }
    const diff = execFileSync("git", ["diff", "-M", `HEAD...${branch}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
    let file = "";
    for (const line of diff.split("\n")) {
      if (line.startsWith("+++ b/")) {
        file = line.slice(6);
      } else if (
        file &&
        TEST_FILE_RE.test(file) &&
        line.startsWith("+") &&
        !line.startsWith("+++") &&
        SKIP_MARKER_RE.test(line)
      ) {
        violations.push(
          `skip/todo added in ${file}: ${line.trim().slice(0, 100)}`,
        );
      }
    }
  } catch {
    // Branch missing or git failed — nothing checkable here; the
    // ahead-of-base gate already excludes branches that don't exist.
  }
  return violations;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const runTokens = zeroTokens();
runLog(
  `\n## Run ${new Date().toISOString()} — max ${MAX_ITERATIONS} cycles, ` +
    `parallel ${MAX_PARALLEL}` +
    (TOKEN_CEILING > 0 ? `, token ceiling ${compact(TOKEN_CEILING)}` : ""),
);

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  assertRepoNotMidMerge();

  if (readyForAgentCount() === 0) {
    console.log("No open ready-for-agent issues — nothing to plan. Exiting.");
    runLog(`- run ended (cycle ${iteration}): backlog empty`);
    break;
  }

  const cycleTokens = zeroTokens();

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

  addTokens(cycleTokens, plan);

  const planned = plan.output.issues;
  const issues = planned.slice(0, MAX_PARALLEL);

  if (issues.length === 0) {
    // No unblocked work — either everything is done or everything is blocked.
    console.log("No unblocked issues to work on. Exiting.");
    foldTokens(runTokens, cycleTokens);
    runLog(`- run ended (cycle ${iteration}): planner found no unblocked issues`);
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

      const tokens = zeroTokens();

      try {
        // The architect (opus) explores for reuse — code graph first — and
        // posts an executable design as an issue comment. On resumed branches
        // whose design is still valid it re-affirms cheaply instead of
        // re-designing. The design comment persists across cycles, so a
        // held-back branch never loses its design context.
        const architect = await sandbox.run({
          name: "architect",
          maxIterations: 3,
          agent: sandcastle.claudeCode("claude-opus-4-8"),
          promptFile: "./.sandcastle/architect-prompt.md",
          promptArgs: {
            TASK_ID: issue.id,
            ISSUE_TITLE: issue.title,
            BRANCH: issue.branch,
          },
          completionSignal: [
            ARCHITECT_VERDICTS.ready,
            ARCHITECT_VERDICTS.blocked,
          ],
        });

        addTokens(tokens, architect);

        if (architect.completionSignal !== ARCHITECT_VERDICTS.ready) {
          // BLOCKED (the architect commented and re-labeled the issue) or no
          // verdict at all — either way there is no design to implement.
          return {
            issue,
            commits: [],
            implementComplete: false,
            reviewApproved: false,
            checksPassed: false,
            tokens,
            note:
              architect.completionSignal === ARCHITECT_VERDICTS.blocked
                ? "architect blocked the issue — needs human input (see issue comment)"
                : "architect produced no design",
          };
        }

        // The implementer (sonnet — the design carries the hard thinking, so
        // the executor can be a cheaper model) executes the architect's
        // design. NEEDS_ARCHITECT is its escape hatch for designs that don't
        // survive contact with the code.
        const implement = await sandbox.run({
          name: "implementer",
          maxIterations: 100,
          agent: sandcastle.claudeCode("claude-sonnet-4-6"),
          promptFile: "./.sandcastle/implement-prompt.md",
          promptArgs: {
            TASK_ID: issue.id,
            ISSUE_TITLE: issue.title,
            BRANCH: issue.branch,
          },
          completionSignal: [
            IMPLEMENT_SIGNALS.complete,
            IMPLEMENT_SIGNALS.needsArchitect,
            IMPLEMENT_SIGNALS.alreadySatisfied,
            IMPLEMENT_SIGNALS.blocked,
          ],
        });

        addTokens(tokens, implement);

        if (
          implement.completionSignal === IMPLEMENT_SIGNALS.alreadySatisfied
        ) {
          // Nothing to implement — the criteria are met by existing code (the
          // implementer left evidence as an issue comment). Skip the reviewer
          // and verifier: there is no diff to review. The orchestrator closes
          // the issue after the pipelines settle.
          return {
            issue,
            commits: implement.commits,
            implementComplete: false,
            reviewApproved: false,
            checksPassed: false,
            alreadySatisfied: true,
            tokens,
            note: "acceptance criteria already met by existing code (see issue comment)",
          };
        }

        if (implement.completionSignal === IMPLEMENT_SIGNALS.blocked) {
          // An acceptance criterion waits on another open issue or on
          // infrastructure the sandbox doesn't have — the design is fine,
          // the work is just not executable yet (the implementer left a
          // comment naming the blocker). Skip the reviewer and verifier;
          // partial commits survive on the branch for the cycle that runs
          // after the blocker clears. Deliberately NOT exempted from the
          // attempt accounting below: plan-prompt.md tells the planner not
          // to select blocked issues, so a re-selection that ends BLOCKED
          // again is a planner misjudgment — MAX_ATTEMPTS such cycles park
          // the issue for a human instead of looping forever.
          return {
            issue,
            commits: implement.commits,
            implementComplete: false,
            reviewApproved: false,
            checksPassed: false,
            tokens,
            note: "implementer blocked by another open issue or missing infrastructure (see issue comment)",
          };
        }

        const implementComplete =
          implement.completionSignal === IMPLEMENT_SIGNALS.complete;

        if (!implementComplete) {
          // Not COMPLETE (NEEDS_ARCHITECT, or the implementer exhausted its
          // iteration budget without signaling) — there is no finished work to
          // review, so skip the opus reviewer and the verifier. The implementer
          // prompt guarantees an issue comment exists (progress notes or the
          // NEEDS_ARCHITECT report) for the next cycle to pick up.
          //
          // We deliberately do NOT also bail on `implement.commits.length === 0`
          // here. A branch fully finished in a PRIOR cycle but held back for a
          // transient reason resumes with its work already committed, so this
          // run signals COMPLETE with zero NEW commits. The reviewer and
          // verifier must still run against the branch's existing commits; the
          // merge gate below decides mergeability from branchIsAheadOfBase, not
          // from this run's commit count.
          return {
            issue,
            commits: implement.commits,
            implementComplete,
            reviewApproved: false,
            checksPassed: false,
            tokens,
            note:
              implement.completionSignal === IMPLEMENT_SIGNALS.needsArchitect
                ? "implementer requested a revised design (NEEDS_ARCHITECT)"
                : "implementer did not signal COMPLETE (e.g. exhausted its iteration budget)",
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
          // TASK_ID lets the verifier leave a failure summary on the issue —
          // otherwise a verify-FAIL after an APPROVE holds the branch back
          // with no written trace for the next cycle to act on.
          promptArgs: { TASK_ID: issue.id },
          completionSignal: [VERIFY_VERDICTS.pass, VERIFY_VERDICTS.fail],
        });

        addTokens(tokens, review);
        addTokens(tokens, verify);

        // Merge commits from both runs so the merge phase sees all of them.
        // Each sandbox.run() only returns commits from its own run. (The
        // verifier is read-only and never commits.)
        return {
          issue,
          commits: [...implement.commits, ...review.commits],
          implementComplete,
          reviewApproved: review.completionSignal === REVIEW_VERDICTS.approve,
          checksPassed: verify.completionSignal === VERIFY_VERDICTS.pass,
          tokens,
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

  // Rejected pipelines lose their usage numbers (the throw discards the
  // partial tally) — the ledger undercounts crashed cycles slightly rather
  // than complicating every stage with try/finally accounting.
  for (const r of results) {
    foldTokens(cycleTokens, r.tokens);
  }

  // Issues the implementer proved already satisfied get closed here on the
  // host, like merge+close below: deterministic code, not a prompt
  // instruction. Closing is cycle progress — the next planner query no
  // longer sees the issue.
  const alreadySatisfied = results.filter((r) => r.alreadySatisfied);
  for (const { issue } of alreadySatisfied) {
    try {
      execFileSync(
        "gh",
        [
          "issue",
          "close",
          issue.id,
          "--comment",
          "Closed by Sandcastle: acceptance criteria already met by existing code — evidence in the comments above.",
        ],
        { stdio: "pipe" },
      );
      console.log(`  ✓ #${issue.id} closed — already satisfied`);
    } catch {
      console.error(
        `  ⚠ #${issue.id} reported already-satisfied but could NOT be ` +
          `closed — close it manually: gh issue close ${issue.id}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Phase 3: Gate
  //
  // Only branches that are complete, approved, and green get merged. Branches
  // with commits that fail any gate are held back — they live on in the repo
  // under their deterministic name, and the next cycle's implementer resumes
  // them (the issue stays open, so the planner re-selects it).
  // -------------------------------------------------------------------------

  // Deterministic test-integrity check, run only on branches that would
  // otherwise merge (two git diffs each — cheap). See
  // testIntegrityViolations() for the failure mode this guards.
  const integrityViolations = new Map<string, string[]>();
  for (const r of results) {
    if (
      !r.alreadySatisfied &&
      r.implementComplete &&
      r.reviewApproved &&
      r.checksPassed &&
      branchIsAheadOfBase(r.issue.branch)
    ) {
      const v = testIntegrityViolations(r.issue.branch);
      if (v.length > 0) integrityViolations.set(r.issue.branch, v);
    }
  }

  const mergeable = results.filter(
    (r) =>
      branchIsAheadOfBase(r.issue.branch) &&
      r.implementComplete &&
      r.reviewApproved &&
      r.checksPassed &&
      !integrityViolations.has(r.issue.branch),
  );

  // Everything that didn't pass the gate gets reported — including pipelines
  // that produced no commits at all (an implementer that burned its iteration
  // budget without committing, or an architect that blocked the issue) so no
  // stuck issue goes unnoticed in the cycle summary.
  const heldBack = results.filter(
    (r) => !mergeable.includes(r) && !r.alreadySatisfied,
  );

  let parked = 0;
  const heldSummaries: string[] = [];
  for (const r of heldBack) {
    const violations = integrityViolations.get(r.issue.branch);
    const reasons = violations
      ? `test-integrity check failed: ${violations.join("; ")}`
      : (r.note ??
        [
          !r.implementComplete && "implementer did not signal COMPLETE",
          !r.reviewApproved && "reviewer did not approve",
          !r.checksPassed && "typecheck/tests did not pass",
        ]
          .filter(Boolean)
          .join("; "));
    const suffix = branchIsAheadOfBase(r.issue.branch)
      ? " — branch kept for the next cycle"
      : "";
    console.log(`  ⏸ ${r.issue.branch} held back (${reasons})${suffix}`);

    // COMPLETE with nothing on the branch is the livelock signature: the
    // branch can never become ahead of base, so the gate will hold it back on
    // every future cycle too (the issue-22 failure mode — a parent/no-op
    // issue). ALREADY_SATISFIED is the well-behaved exit for that situation;
    // this is the backstop when the implementer says COMPLETE instead.
    if (r.implementComplete && !branchIsAheadOfBase(r.issue.branch)) {
      if (
        parkIssue(
          r.issue.id,
          "Parked by Sandcastle: the implementer signaled COMPLETE but produced no commits and the branch has no work to merge — likely already satisfied by existing code (possibly via child issues) or mis-specified. A human should close or re-spec it; re-add `ready-for-agent` to hand it back to the agents.",
        )
      ) {
        parked++;
        console.log(
          `  ⏸ #${r.issue.id} parked (ready-for-agent → needs-triage) — COMPLETE with no work to merge`,
        );
      }
      heldSummaries.push(`#${r.issue.id} parked (no-op COMPLETE)`);
      continue;
    }

    // Architect-BLOCKED issues already left the planner's pool via the
    // needs-info label swap the architect itself performs — no counter needed.
    if (r.note?.startsWith("architect blocked")) {
      heldSummaries.push(`#${r.issue.id} blocked by architect`);
      continue;
    }

    // Attempt accounting: every other held-back result is a failed cycle.
    // Record the deterministic marker comment (the trail the next cycle's
    // agents and the parking human both read), and on the Nth strike park the
    // issue — bounded retry then escalate, at the task level. Without this an
    // issue that commits every cycle but keeps failing review/verify churns
    // until MAX_ITERATIONS: the no-progress breaker only sees zero-commit
    // cycles.
    let attempts = 0;
    try {
      execFileSync(
        "gh",
        [
          "issue",
          "comment",
          r.issue.id,
          "--body",
          `${FAILED_CYCLE_MARKER}\nSandcastle failed cycle: ${reasons}`,
        ],
        { stdio: "pipe" },
      );
      attempts = failedCycleCount(r.issue.id);
    } catch {
      // Comment failed (network, auth) — skip counting this cycle rather
      // than guessing; the branch itself is unaffected.
    }
    if (attempts >= MAX_ATTEMPTS) {
      if (
        parkIssue(
          r.issue.id,
          `Parked by Sandcastle after ${attempts} failed cycles (last: ${reasons}). ` +
            `The branch \`${r.issue.branch}\` is kept. A human should read the failure ` +
            "trail above and either fix the blocker or re-spec; re-add `ready-for-agent` " +
            "to hand it back to the agents.",
        )
      ) {
        parked++;
        console.log(
          `  ⏸ #${r.issue.id} parked — ${attempts} failed cycles (cap ${MAX_ATTEMPTS})`,
        );
      }
      heldSummaries.push(`#${r.issue.id} parked (${attempts} failed cycles)`);
    } else {
      heldSummaries.push(
        `#${r.issue.id} held, attempt ${attempts}/${MAX_ATTEMPTS} (${reasons.slice(0, 80)})`,
      );
    }
  }

  console.log(
    `\nExecution complete. ${mergeable.length} of ${results.length} branch(es) ready to merge:`,
  );
  for (const r of mergeable) {
    console.log(`  ${r.issue.branch}`);
  }

  // Everything an agent could bill for in this cycle has run by now.
  foldTokens(runTokens, cycleTokens);

  // One ledger line per cycle, whatever way the cycle ends.
  const cycleLine = (
    status: string,
    mergedIds: string[] = [],
    skippedIds: string[] = [],
  ) =>
    runLog(
      `- ${new Date().toISOString()} cycle ${iteration}/${MAX_ITERATIONS} | ` +
        `planned [${issues.map((i) => i.id).join(",")}] | ` +
        `merged [${mergedIds.join(",")}] | skipped [${skippedIds.join(",")}] | ` +
        `closed [${alreadySatisfied.map((r) => r.issue.id).join(",")}] | ` +
        `held: ${heldSummaries.join("; ") || "none"} | ` +
        `tokens ${fmtTokens(cycleTokens)} | run-total ${compact(totalTokens(runTokens))} | ` +
        status,
    );

  // Budget check, cycle-boundary only (see TOKEN_CEILING note above).
  const ceilingHit = (): boolean => {
    if (TOKEN_CEILING > 0 && totalTokens(runTokens) >= TOKEN_CEILING) {
      console.log(
        `Token ceiling reached (${compact(totalTokens(runTokens))} of ` +
          `${compact(TOKEN_CEILING)}) — stopping at the cycle boundary.`,
      );
      runLog(
        `- run ended (cycle ${iteration}): token ceiling ${compact(TOKEN_CEILING)} reached`,
      );
      return true;
    }
    return false;
  };

  if (mergeable.length === 0) {
    // Did this cycle change anything the next cycle would see? New commits
    // resume on held-back branches; closed or parked issues leave the planner
    // query. If none of that happened, the next cycle's inputs are identical
    // to this one's — iterating again would replay the exact same cycle
    // (agents are the only nondeterminism, and burning tokens on a coin flip
    // is not a strategy). Stop loudly instead.
    const cycleMadeProgress =
      results.some((r) => r.commits.length > 0) ||
      alreadySatisfied.length > 0 ||
      parked > 0;
    if (!cycleMadeProgress) {
      console.log(
        "Stopping: cycle made no progress — nothing merged, no new commits, " +
          "no issues closed or parked. The next cycle's inputs would be " +
          "identical; see the held-back reasons above and resolve them " +
          "before re-running.",
      );
      cycleLine("STOPPED: no-progress breaker");
      break;
    }
    // All agents ran but nothing passed the gate — nothing to merge this
    // cycle. Held-back branches resume next iteration.
    console.log("No branches passed the gate. Nothing to merge.");
    cycleLine("nothing mergeable");
    if (ceilingHit()) break;
    continue;
  }

  // -------------------------------------------------------------------------
  // Phase 4: Merge
  //
  // No agent here — merging is deterministic, so the orchestrator does it
  // directly on the host (git needs no node_modules, and gh is authenticated
  // on the host). Each branch's issue is closed immediately after its merge:
  // merge and close are a pair, and as code the ordering is guaranteed, not a
  // prompt instruction a model might reorder.
  //
  // Conflicted branches are skipped, NOT resolved. The next cycle's
  // implementer merges the target branch into them in-branch (see
  // implement-prompt.md), where the test suite can actually validate the
  // resolution — a strictly better place than here, where it can't run.
  //
  // execFileSync (no shell) throughout: branch names and issue ids originate
  // from planner model output and must never reach a shell.
  // -------------------------------------------------------------------------
  const merged: PlannedIssue[] = [];
  const skipped: PlannedIssue[] = [];

  console.log("");
  for (const { issue } of mergeable) {
    try {
      execFileSync("git", ["merge", issue.branch, "--no-edit"], {
        stdio: "pipe",
        encoding: "utf8",
      });
    } catch (error) {
      // Restore a clean tree and hold the branch for the next cycle.
      try {
        execFileSync("git", ["merge", "--abort"], { stdio: "pipe" });
      } catch {
        // No merge in progress to abort (e.g. the ref didn't exist at all).
      }
      const stdout = (error as { stdout?: string }).stdout ?? "";
      const conflicts = stdout
        .split("\n")
        .filter((line) => line.startsWith("CONFLICT"))
        .slice(0, 3);
      skipped.push(issue);
      console.log(
        `  ✗ ${issue.branch} skipped — merge did not apply cleanly` +
          (conflicts.length > 0 ? `\n      ${conflicts.join("\n      ")}` : ""),
      );
      continue;
    }

    merged.push(issue);
    console.log(`  ✓ ${issue.branch} merged`);

    try {
      execFileSync(
        "gh",
        ["issue", "close", issue.id, "--comment", "Completed by Sandcastle"],
        { stdio: "pipe" },
      );
    } catch {
      // The merge landed but the close didn't. This is the one state that
      // cannot self-heal: the planner would re-select a fully merged issue
      // forever (nothing left to commit, so it can never pass the gate).
      // Make it loud and tell the human the exact fix.
      console.error(
        `  ⚠ ${issue.branch} merged but issue #${issue.id} could NOT be ` +
          `closed — close it manually: gh issue close ${issue.id}`,
      );
    }
  }

  console.log(
    `\nMerge phase done: ${merged.length} merged, ${skipped.length} skipped` +
      `${skipped.length > 0 ? " (held for the next cycle)" : ""}.`,
  );

  if (merged.length === 0) {
    // Nothing landed on the target branch, so there is nothing new to verify.
    cycleLine(
      "all merges conflicted — resolved in-branch next cycle",
      [],
      skipped.map((i) => i.id),
    );
    if (ceilingHit()) break;
    continue;
  }

  console.log("\nVerifying the merged result on the host...");

  // Each branch was verified green in isolation, but two independently green
  // branches can still break each other, and the merger can't run the suite
  // (Linux container, macOS node_modules). Verify here on the host — the one
  // place with a working toolchain — and stop rather than let a broken base
  // feed the next cycle's branches. `pnpm install` first: merged branches may
  // have changed the lockfile. (Merges stay local; pushing is the human's
  // call.)
  try {
    execSync("pnpm install && pnpm typecheck && pnpm test", {
      stdio: "inherit",
    });
  } catch {
    console.error(
      "\nMerged result fails checks on the host. Stopping so the next cycle " +
        "doesn't build on a broken base — inspect the merge, fix or revert, " +
        "then re-run.",
    );
    cycleLine(
      "ABORTED: merged result RED on host",
      merged.map((i) => i.id),
      skipped.map((i) => i.id),
    );
    process.exit(1);
  }

  console.log("\nMerged result verified.");
  cycleLine(
    "ok",
    merged.map((i) => i.id),
    skipped.map((i) => i.id),
  );
  if (ceilingHit()) break;
}

runLog(
  `- run finished ${new Date().toISOString()} — total ${compact(totalTokens(runTokens))} tokens`,
);
console.log("\nAll done.");
