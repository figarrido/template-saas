// Parallel Planner with Review — multi-phase orchestration loop
//
// This template drives a multi-phase workflow in which all merging happens
// through GitHub pull requests gated by CI, routed per SPEC. A spec is a
// parent/tracking issue; its child issues declare it in a "## Parent" body
// section. Each spec accumulates work on its own branch (spec/<n>-<slug>),
// so two specs progress on parallel paths and land on main independently.
// main only ever moves when a HUMAN merges a PR — the orchestrator's
// authority ends at spec branches.
//
//   Phase 1 (Plan):             The script first asks GitHub whether any
//                               ready-for-agent issues exist at all (a drained
//                               backlog must not cost a model call). Then an
//                               opus agent analyzes open issues, builds a
//                               dependency graph, and outputs a <plan> JSON
//                               listing unblocked issues with branch names and
//                               Conventional-Commits PR titles.
//   Phase 1.5 (Route):          For each planned issue the orchestrator reads
//                               the issue body and parses its "## Parent"
//                               section DETERMINISTICALLY — routing decisions
//                               never trust model output. Children map to
//                               their spec's branch (created server-side from
//                               origin/main on first use); issues with no
//                               parent target main directly. Specs whose
//                               spec→main PR is red or conflicting are
//                               quarantined: their children are dropped this
//                               cycle (with one comment on the tracking
//                               issue), other specs continue. The check is
//                               live — no stored state — so a spec heals the
//                               moment its branch does.
//   Phase 2 (Design + Execute + Review):
//                               For each issue, a sandbox worktree is cut from
//                               its base ref (origin/<spec-branch> or
//                               origin/main). An opus architect explores the
//                               code and posts a design to the issue; a sonnet
//                               implementer executes that design (up to 100
//                               iterations), with escape signals for designs
//                               that collide with reality (NEEDS_ARCHITECT) or
//                               work blocked on another issue (BLOCKED). If it
//                               commits and signals COMPLETE, an opus reviewer
//                               emits an APPROVE/REQUEST_CHANGES verdict, then
//                               a cheap verifier re-runs typecheck + tests and
//                               emits PASS/FAIL — the verifier stays even
//                               though CI re-checks everything, because a
//                               30-second local check that stops a red branch
//                               here saves a 6-minute CI round trip later.
//   Phase 3 (Gate):             A branch is publishable only if the
//                               implementer signaled COMPLETE, the reviewer
//                               approved, the verifier passed, AND a
//                               deterministic test-integrity diff finds no
//                               deleted test files or added skip/todo markers.
//                               Anything else is held back — the branch
//                               survives and the next cycle resumes it (branch
//                               names are deterministic per issue). Anti-
//                               livelock rules: ALREADY_SATISFIED issues are
//                               closed; a COMPLETE claim with no work to merge
//                               is parked; every other held-back cycle posts a
//                               failure-marker comment, and MAX_ATTEMPTS such
//                               failures park the issue for a human.
//   Phase 4 (Publish):          Gate-passing branches are pushed and get a PR
//                               against their base (spec branch, or main for
//                               parentless issues). The orchestrator waits for
//                               the CI fast gate on every PR in parallel, then
//                               acts serially:
//                                 - green child of a spec → squash-merged
//                                   server-side (`gh pr merge`) and its issue
//                                   closed explicitly — closing keywords only
//                                   fire on the default branch, so the close
//                                   is code, not convention. The local branch
//                                   ref is deleted: after a squash the
//                                   original commits are never in the base's
//                                   ancestry, so a lingering ref would look
//                                   "ahead" forever if the issue is reopened.
//                                 - green parentless PR (base = main) → NOT
//                                   merged. The issue's ready-for-agent label
//                                   is swapped for in-review and the PR waits
//                                   for the human. Closes #N in its body
//                                   auto-closes the issue on merge.
//                                 - red or timed-out CI → failure-marker
//                                   comment; the same MAX_ATTEMPTS parking as
//                                   any other failed cycle.
//                                 - a PR GitHub cannot merge (conflict with a
//                                   sibling merged moments earlier) is
//                                   skipped, not resolved — the next cycle's
//                                   implementer syncs the branch with its base
//                                   in-branch, where the test suite runs.
//                               Each spec touched by a merge gets/keeps a
//                               spec→main PR labeled `wip` (a normal PR, not a
//                               draft — drafts are paywalled on private
//                               repos). Every merge into the spec branch
//                               re-runs the fast gate on that PR, so the
//                               combined state of the spec is continuously
//                               CI-checked — that replaces the old host-side
//                               verify. When a spec's last open child closes,
//                               `wip` is swapped for `in-review`: the human's
//                               morning queue is `label:in-review`. Landing is
//                               rebase-and-merge (fallback: merge commit),
//                               chosen by the human in the GitHub UI.
//
// At run start every open spec PR is synced with main via GitHub's
// update-branch API — a MERGE, never a rebase: spec branches are the base of
// open child PRs, and rewriting them would cascade force-pushes across all
// in-flight work. Sync conflicts surface as CONFLICTING mergeable state and
// quarantine the spec.
//
// The host repo is a passive clone throughout: no checkouts, no local merges,
// no mid-merge crash states. Everything the run produces lives on origin
// (branches + PRs) or in the issue tracker.
//
// The outer loop repeats up to MAX_ITERATIONS times so that newly unblocked
// issues are picked up after each round of merges.
//
// Usage:
//   pnpm sandcastle                  # defaults: 4 issues per cycle, 10 cycles
//   pnpm sandcastle --parallel 2     # take only the top 2 issues per cycle
//   pnpm sandcastle -p 1 -i 1        # one issue, one cycle — slow mode
//   pnpm sandcastle --spec 22        # only children of tracking issue #22
//   SANDCASTLE_MAX_TOKENS=20000000 pnpm sandcastle
//                                    # optional token budget for the run;
//                                    # checked at cycle boundaries only
// (defined in package.json as "sandcastle": "tsx .sandcastle/main.mts";
// pnpm forwards flags after the script name straight to the script)
//
// Every run appends to .sandcastle/RUN_LOG.md (gitignored): a header line per
// run and one line per cycle — planned/merged/handed-off/skipped/closed/held
// issues and token usage — so an overnight run is skimmable without opening
// per-role logs.

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";

// The planner emits its plan as JSON inside <plan> tags; Output.object extracts
// and validates it against this schema. `prTitle` is optional with a
// deterministic fallback — a malformed planner title must not abort the run,
// but pr-title.yml enforces Conventional Commits on every PR, so we validate
// before use either way.
const planSchema = z.object({
  issues: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      branch: z.string(),
      prTitle: z.string().optional(),
    }),
  ),
});

type PlannedIssue = z.infer<typeof planSchema>["issues"][number];

// A spec = a parent/tracking issue whose children land through a shared
// branch. Resolved once per run and cached — titles and branch names are
// deterministic.
type Spec = {
  id: string;
  title: string;
  branch: string;
};

// One planned issue routed to its base: `spec` is null for parentless issues,
// whose PRs target main and wait for a human. `base` is an origin/* ref —
// the remote is the source of truth for every base branch; the host repo
// never checks any of them out.
type WorkItem = {
  issue: PlannedIssue;
  spec: Spec | null;
  base: string;
};

// What each per-issue pipeline resolves to. The gate in Phase 3 needs all
// three booleans to be true (and the branch to be ahead of its base) before a
// branch is handed to Phase 4. `note` explains an early exit (architect
// blocked, NEEDS_ARCHITECT, not COMPLETE) so the cycle report can say why.
type PipelineResult = {
  work: WorkItem;
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
// the whole iteration budget re-confirming its blocker).
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
    spec: { type: "string", short: "s" },
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

// Maximum number of plan→execute→publish cycles before stopping
// (--iterations). Raise this if your backlog is large; lower it for a quick
// smoke-test run.
const MAX_ITERATIONS = positiveInt("iterations", flags.iterations, 10);

// Cap on how many issues run concurrently in one cycle (--parallel). Each
// issue spins up its own Docker container plus a ~90s clean `pnpm install`,
// and runs an implementer for up to 100 iterations — a wide-open backlog
// would saturate the machine and the token budget. The planner lists issues
// highest-priority first, so slicing keeps the most important ones.
const MAX_PARALLEL = positiveInt("parallel", flags.parallel, 4);

// Optional scope: only work children of this tracking issue. The planner is
// told about the scope as a courtesy, but the enforcement is the
// deterministic parent parse in Phase 1.5 — never the model.
const SPEC_FILTER = (() => {
  if (flags.spec === undefined) return null;
  if (!/^\d+$/.test(flags.spec)) {
    console.error(`--spec must be an issue number, got "${flags.spec}"`);
    process.exit(1);
  }
  return flags.spec;
})();

// How long to wait for a PR's CI checks before counting the cycle as failed.
// The fast gate takes ~3–6 minutes; 20 gives headroom for queue congestion
// without letting a hung workflow stall the whole run.
const CHECKS_TIMEOUT_MS = 20 * 60_000;
const CHECKS_POLL_MS = 20_000;

// PR labels for the human's queue: `wip` = spec in flight, `in-review` =
// awaiting the human's review/merge. Normal PRs + labels instead of GitHub
// draft PRs on purpose: drafts are paywalled on private repos and this
// template is synced into several of them.
const WIP_LABEL = "wip";
const IN_REVIEW_LABEL = "in-review";

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

// ---------------------------------------------------------------------------
// Small process helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// execFileSync with stderr captured — many gh/git failures here are expected
// states (conflict, missing ref, pending checks) that callers classify from
// the message or swallow via tryCmd.
function runCmd(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function tryCmd(cmd: string, args: string[]): string | null {
  try {
    return runCmd(cmd, args);
  } catch {
    return null;
  }
}

function stderrOf(error: unknown): string {
  const e = error as { stderr?: string; message?: string };
  return (e.stderr ?? e.message ?? String(error)).trim();
}

// owner/repo for `gh api` paths. Resolved once — everything downstream needs
// gh anyway, so failing loudly here beats failing halfway through a cycle.
const REPO = (() => {
  const out = tryCmd("gh", [
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "--jq",
    ".nameWithOwner",
  ]);
  if (!out) {
    console.error(
      "Cannot resolve the GitHub repo (gh repo view failed) — is gh authenticated?",
    );
    process.exit(1);
  }
  return out;
})();

// `--force` makes label creation idempotent (it updates color/description
// when the label already exists) instead of erroring.
function ensureLabels(): void {
  const labels: [string, string, string][] = [
    [WIP_LABEL, "FBCA04", "Sandcastle: spec branch in flight"],
    [IN_REVIEW_LABEL, "0E8A16", "Awaiting human review/merge"],
  ];
  for (const [name, color, description] of labels) {
    if (
      tryCmd("gh", [
        "label",
        "create",
        name,
        "--color",
        color,
        "--description",
        description,
        "--force",
      ]) === null
    ) {
      console.error(`  ⚠ could not ensure label "${name}" — create it manually`);
    }
  }
}

function gitFetch(): void {
  try {
    runCmd("git", ["fetch", "origin", "--prune"]);
  } catch (error) {
    // A run without a reachable origin cannot publish anything — stop before
    // burning tokens on work that has nowhere to go.
    console.error(`git fetch origin failed: ${stderrOf(error)}`);
    process.exit(1);
  }
}

// Whether a branch carries any commit its BASE ref doesn't already have. The
// gate must NOT depend on how many commits the CURRENT implementer run
// produced: a branch fully finished in a PRIOR cycle resumes with its work
// already committed, so its implementer re-affirms COMPLETE while adding zero
// new commits — yet it is still perfectly publishable. Asked of git on the
// HOST, where branch refs survive sandbox.close().
function branchIsAheadOfBase(branch: string, base: string): boolean {
  try {
    const count = runCmd("git", ["rev-list", "--count", `${base}..${branch}`]);
    return Number(count) > 0;
  } catch {
    // Branch ref missing (never created, or pruned) — nothing to publish.
    return false;
  }
}

// How many issues the planner would even see. plan-prompt.md interpolates this
// same query at prompt-build time; asking first from the script means a
// drained backlog costs one `gh` call instead of an opus planner run.
function readyForAgentCount(): number {
  const out = tryCmd("gh", [
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
  ]);
  return Number(out) || 0;
}

// ---------------------------------------------------------------------------
// Spec routing: parent parsing, spec branches, quarantine
// ---------------------------------------------------------------------------

// The "## Parent" convention from docs/agents/triage-labels.md: child issues
// carry a body section like "## Parent\n\n#22 — Operator backoffice v1".
function parseParentIssue(body: string): string | null {
  const match = body.match(/^##\s*Parent\s*\n+\s*#(\d+)/m);
  return match ? match[1]! : null;
}

// Bulk parent lookup for every ready-for-agent issue — one gh call per cycle
// instead of one per planned issue.
function fetchReadyIssueParents(): Map<string, string | null> {
  const parents = new Map<string, string | null>();
  const out = tryCmd("gh", [
    "issue",
    "list",
    "--state",
    "open",
    "--label",
    "ready-for-agent",
    "--limit",
    "100",
    "--json",
    "number,body",
  ]);
  if (!out) return parents;
  try {
    const rows = JSON.parse(out) as { number: number; body: string | null }[];
    for (const row of rows) {
      parents.set(String(row.number), parseParentIssue(row.body ?? ""));
    }
  } catch {
    // Unparseable listing — fall back to per-issue lookups below.
  }
  return parents;
}

function parentOfIssue(
  id: string,
  cache: Map<string, string | null>,
): string | null {
  if (cache.has(id)) return cache.get(id)!;
  const body = tryCmd("gh", ["issue", "view", id, "--json", "body", "--jq", ".body"]);
  const parent = body === null ? null : parseParentIssue(body);
  cache.set(id, parent);
  return parent;
}

// Deterministic, ref-safe slug — same reasoning as deterministic issue branch
// names: re-deriving the same spec always yields the same branch, so resumed
// runs reuse existing branches and PRs.
function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "spec"
  );
}

// Specs resolved this run. Branch names are stable across runs (issue number
// + title slug), so a spec resumed tomorrow reuses today's branch and PR.
const specCache = new Map<string, Spec>();
const specBranchEnsured = new Set<string>();

function resolveSpec(specId: string): Spec | null {
  const cached = specCache.get(specId);
  if (cached) return cached;
  const title = tryCmd("gh", [
    "issue",
    "view",
    specId,
    "--json",
    "title",
    "--jq",
    ".title",
  ]);
  if (title === null) return null;
  const spec: Spec = { id: specId, title, branch: `spec/${specId}-${slugify(title)}` };
  specCache.set(specId, spec);
  return spec;
}

// Create the spec branch on ORIGIN if it doesn't exist — server-side ref
// creation from origin/main, no local branch involved. The host repo only
// ever needs origin/<spec-branch>, refreshed by the per-cycle fetch.
function ensureSpecBranchOnOrigin(spec: Spec): boolean {
  if (specBranchEnsured.has(spec.branch)) return true;
  const existing = tryCmd("git", ["ls-remote", "--heads", "origin", spec.branch]);
  if (existing) {
    specBranchEnsured.add(spec.branch);
    return true;
  }
  const mainSha = tryCmd("git", ["rev-parse", "origin/main"]);
  if (!mainSha) return false;
  if (
    tryCmd("gh", [
      "api",
      `repos/${REPO}/git/refs`,
      "-f",
      `ref=refs/heads/${spec.branch}`,
      "-f",
      `sha=${mainSha}`,
    ]) === null
  ) {
    return false;
  }
  // Make origin/<spec-branch> resolvable locally right away — sandboxes cut
  // their worktrees from it this same cycle.
  gitFetch();
  specBranchEnsured.add(spec.branch);
  console.log(`  ⎇ created ${spec.branch} from origin/main (spec #${spec.id})`);
  return true;
}

function findOpenPr(head: string, base: string): number | null {
  const out = tryCmd("gh", [
    "pr",
    "list",
    "--state",
    "open",
    "--head",
    head,
    "--base",
    base,
    "--json",
    "number",
    "--jq",
    ".[0].number",
  ]);
  // gh --jq prints the literal string "null" when the list is empty — only a
  // real integer means a PR exists.
  const parsed = Number(out);
  return out && Number.isInteger(parsed) ? parsed : null;
}

// Snapshot of a PR's check buckets. `gh pr checks` exits non-zero when checks
// are pending or failing even with --json, so the JSON is read from the
// error's stdout when the call "fails".
function checksSnapshot(prNumber: number): "pass" | "fail" | "pending" | "none" {
  let raw: string;
  try {
    raw = runCmd("gh", ["pr", "checks", String(prNumber), "--json", "bucket"]);
  } catch (error) {
    raw = ((error as { stdout?: string }).stdout ?? "").trim();
  }
  let buckets: { bucket: string }[];
  try {
    buckets = JSON.parse(raw) as { bucket: string }[];
  } catch {
    return "none";
  }
  if (buckets.length === 0) return "none";
  if (buckets.some((b) => b.bucket === "fail" || b.bucket === "cancel")) return "fail";
  if (buckets.every((b) => b.bucket === "pass" || b.bucket === "skipping")) return "pass";
  return "pending";
}

// One quarantine comment per broken head SHA — the SHA in the marker is the
// dedup key, so a spec that breaks, heals, and breaks again gets a fresh
// comment, but a spec that stays broken across cycles is not spammed.
function quarantineCommentOnce(
  spec: Spec,
  prNumber: number,
  headSha: string,
  reason: string,
): void {
  const marker = `<!-- sandcastle:quarantine ${headSha} -->`;
  const count = tryCmd("gh", [
    "issue",
    "view",
    spec.id,
    "--json",
    "comments",
    "--jq",
    `[.comments[].body | select(startswith("${marker}"))] | length`,
  ]);
  if (Number(count) > 0) return;
  tryCmd("gh", [
    "issue",
    "comment",
    spec.id,
    "--body",
    `${marker}\nSandcastle quarantined this spec: ${reason} (PR #${prNumber}). ` +
      `Its child issues are skipped until the spec branch is green and mergeable ` +
      `again — fix it directly or hand the failure to an agent as a normal issue.`,
  ]);
}

// A spec is workable iff its spec→main PR is not red and not conflicting.
// Live check, no stored quarantine state: it self-heals the moment a human
// (or a later merge) fixes the branch, and a fresh run tomorrow still refuses
// to build on a broken base. Pending/unknown counts as workable — refusing to
// work while CI is merely in flight would serialize every cycle.
function specWorkability(spec: Spec): { workable: boolean; reason?: string } {
  const prNumber = findOpenPr(spec.branch, "main");
  if (prNumber === null) return { workable: true };
  const view = tryCmd("gh", [
    "pr",
    "view",
    String(prNumber),
    "--json",
    "mergeable,headRefOid",
  ]);
  let mergeable = "UNKNOWN";
  let headSha = "";
  if (view) {
    try {
      const parsed = JSON.parse(view) as { mergeable: string; headRefOid: string };
      mergeable = parsed.mergeable;
      headSha = parsed.headRefOid;
    } catch {
      // Fall through with UNKNOWN — treated as workable.
    }
  }
  if (mergeable === "CONFLICTING") {
    quarantineCommentOnce(spec, prNumber, headSha, "the spec branch conflicts with main");
    return { workable: false, reason: "spec branch conflicts with main" };
  }
  if (checksSnapshot(prNumber) === "fail") {
    quarantineCommentOnce(spec, prNumber, headSha, "CI is red on the spec branch");
    return { workable: false, reason: "CI red on spec branch" };
  }
  return { workable: true };
}

// Run-start sync: merge main into every open spec branch via GitHub's
// update-branch API. A MERGE, never a rebase — spec branches are the base of
// open child PRs, and a rewrite would invalidate every one of them (and
// require force-pushes, which this machine never does). 422 responses are
// expected states: already up to date, or a conflict — the latter surfaces
// as CONFLICTING on the spec PR and quarantines the spec.
function syncSpecBranchesWithMain(): void {
  const out = tryCmd("gh", [
    "pr",
    "list",
    "--state",
    "open",
    "--base",
    "main",
    "--json",
    "number,headRefName",
  ]);
  if (!out) return;
  let prs: { number: number; headRefName: string }[];
  try {
    prs = JSON.parse(out) as { number: number; headRefName: string }[];
  } catch {
    return;
  }
  for (const pr of prs) {
    if (!pr.headRefName.startsWith("spec/")) continue;
    try {
      runCmd("gh", ["api", "-X", "PUT", `repos/${REPO}/pulls/${pr.number}/update-branch`]);
      console.log(`  ⇅ ${pr.headRefName} updated with main (PR #${pr.number})`);
    } catch (error) {
      if (/merge conflict/i.test(stderrOf(error))) {
        console.log(
          `  ⚠ ${pr.headRefName} conflicts with main — spec will be quarantined until resolved`,
        );
      }
      // "already up to date" and similar 422s are no-ops by design.
    }
  }
}

// ---------------------------------------------------------------------------
// PR publishing: titles, creation, CI wait, merge
// ---------------------------------------------------------------------------

// pr-title.yml enforces Conventional Commits (lowercase subject) on every PR
// title, and squash promotes the title into the spec branch's history — so a
// bad planner title must be repaired, not passed through.
const CONVENTIONAL_TITLE_RE =
  /^(feat|fix|chore|docs|refactor|perf|test|build|ci|revert)(\([^)]*\))?!?: [^A-Z]/;

function prTitleFor(issue: PlannedIssue): string {
  if (issue.prTitle && CONVENTIONAL_TITLE_RE.test(issue.prTitle)) return issue.prTitle;
  const subject = issue.title.charAt(0).toLowerCase() + issue.title.slice(1);
  return `feat: ${subject}`;
}

// Find-or-create the PR for an issue branch. Deterministic branch names make
// the PR resumable across cycles: a held-back branch keeps one PR that
// accumulates its history instead of spawning a new PR per attempt.
function ensureIssuePr(work: WorkItem): number | null {
  const { issue, spec } = work;
  const baseBranch = spec ? spec.branch : "main";
  const existing = findOpenPr(issue.branch, baseBranch);
  if (existing !== null) return existing;
  // Child PRs get no closing keyword: "Closes #N" only fires on the default
  // branch, and the orchestrator closes child issues itself right after the
  // merge. Parentless PRs DO carry it — a human merging into main is exactly
  // when native auto-close works.
  const body = spec
    ? `Implements #${issue.id} — part of spec #${spec.id} (\`${spec.branch}\`).\n\n` +
      `Squash-merged into the spec branch by Sandcastle once CI is green.`
    : `Closes #${issue.id}.\n\nOpened by Sandcastle; awaiting human review and merge.`;
  try {
    runCmd("gh", [
      "pr",
      "create",
      "--head",
      issue.branch,
      "--base",
      baseBranch,
      "--title",
      prTitleFor(issue),
      "--body",
      body,
    ]);
  } catch (error) {
    console.error(`  ⚠ PR creation failed for ${issue.branch}: ${stderrOf(error)}`);
    return null;
  }
  return findOpenPr(issue.branch, baseBranch);
}

async function waitForChecks(prNumber: number): Promise<"pass" | "fail" | "timeout"> {
  const deadline = Date.now() + CHECKS_TIMEOUT_MS;
  // Checks register asynchronously after PR creation, and workflows register
  // at different speeds — polling immediately could see only the fast
  // pr-title check (already green) and miss the CI jobs entirely. One poll
  // interval of patience lets every triggered workflow's jobs appear before
  // the first verdict is read.
  await sleep(CHECKS_POLL_MS);
  while (Date.now() < deadline) {
    const snapshot = checksSnapshot(prNumber);
    if (snapshot === "pass") return "pass";
    if (snapshot === "fail") return "fail";
    // "none" = checks not registered yet — keep polling until the deadline.
    await sleep(CHECKS_POLL_MS);
  }
  return "timeout";
}

// Squash-merge a child PR into its spec branch. Retried because merging PR A
// recomputes PR B's mergeability, which GitHub reports as a transient "not
// mergeable" for a few seconds. A conflict that persists is skipped, not
// resolved — the next cycle's implementer syncs the branch with its base
// in-branch, where the test suite can validate the resolution.
async function mergePrWithRetry(prNumber: number): Promise<"merged" | "conflict"> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      runCmd("gh", ["pr", "merge", String(prNumber), "--squash", "--delete-branch"]);
      return "merged";
    } catch (error) {
      if (attempt === 3) {
        console.error(`  ⚠ merge of PR #${prNumber} failed: ${stderrOf(error)}`);
        break;
      }
      await sleep(8_000);
    }
  }
  return "conflict";
}

// Find-or-create the spec→main PR. Born as a normal PR labeled `wip` — its
// job during the run is to re-run the fast CI gate on the spec's combined
// state after every merge (this replaces the old host-side verify), and its
// mergeable/checks state is the quarantine signal.
function ensureSpecPr(spec: Spec): number | null {
  const existing = findOpenPr(spec.branch, "main");
  if (existing !== null) return existing;
  const subject = spec.title.charAt(0).toLowerCase() + spec.title.slice(1);
  try {
    runCmd("gh", [
      "pr",
      "create",
      "--head",
      spec.branch,
      "--base",
      "main",
      "--title",
      `feat: ${subject}`,
      "--label",
      WIP_LABEL,
      "--body",
      `Closes #${spec.id}.\n\n` +
        `Spec branch for #${spec.id}; child issues are squash-merged here by ` +
        `Sandcastle as their PRs go green. Land with **rebase and merge** to keep ` +
        `main linear with one commit per issue (fall back to a merge commit if the ` +
        `replay conflicts).`,
    ]);
  } catch (error) {
    console.error(`  ⚠ spec PR creation failed for ${spec.branch}: ${stderrOf(error)}`);
    return null;
  }
  return findOpenPr(spec.branch, "main");
}

// Open children of a spec, by the same "## Parent" convention — counted over
// ALL open issues, not just ready-for-agent ones: a parked (needs-triage)
// child still means the spec is unfinished.
function openChildCount(specId: string): number {
  const out = tryCmd("gh", [
    "issue",
    "list",
    "--state",
    "open",
    "--limit",
    "200",
    "--json",
    "number,body",
  ]);
  // Fail closed: never flip a spec to in-review on a failed lookup.
  if (!out) return Number.MAX_SAFE_INTEGER;
  try {
    const rows = JSON.parse(out) as { number: number; body: string | null }[];
    return rows.filter((row) => parseParentIssue(row.body ?? "") === specId).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

// When the last open child closes, the spec PR graduates from `wip` to
// `in-review` — the human's morning queue is `label:in-review`.
function markSpecReadyIfDone(spec: Spec, prNumber: number): void {
  if (openChildCount(spec.id) > 0) return;
  tryCmd("gh", [
    "pr",
    "edit",
    String(prNumber),
    "--remove-label",
    WIP_LABEL,
    "--add-label",
    IN_REVIEW_LABEL,
  ]);
  tryCmd("gh", [
    "pr",
    "comment",
    String(prNumber),
    "--body",
    `All child issues of #${spec.id} are closed — this spec is ready to land. ` +
      `Prefer **rebase and merge**; if the replay conflicts, use a merge commit.`,
  ]);
  console.log(`  ★ ${spec.branch} complete — spec PR #${prNumber} marked ${IN_REVIEW_LABEL}`);
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
// cycle always finishes cleanly — the ceiling stops the NEXT lap, it never
// corrupts the current one. Without any budget the practical backstop is the
// subscription rate limit, hit blind mid-cycle.
const TOKEN_CEILING = Number(process.env.SANDCASTLE_MAX_TOKENS) || 0;

// ---------------------------------------------------------------------------
// Per-issue attempt cap and test-integrity gate
// ---------------------------------------------------------------------------

// Bounded retry, then escalate to a human (12-factor agents, factor 9): a
// churning issue — new commits every cycle, but review, verify, or CI keeps
// failing — never trips the no-progress breaker (which only sees zero-commit
// cycles) and would otherwise be re-selected until MAX_ITERATIONS.
const MAX_ATTEMPTS = 3;
const FAILED_CYCLE_MARKER = "<!-- sandcastle:failed-cycle -->";

// How many cycles have already failed on this issue, counted from the
// orchestrator's own marker comments. GitHub comments are the
// cross-invocation store — the same reasoning as deterministic branch names:
// state that must survive the process lives outside it.
function failedCycleCount(issueId: string): number {
  const out = tryCmd("gh", [
    "issue",
    "view",
    issueId,
    "--json",
    "comments",
    "--jq",
    `[.comments[].body | select(startswith("${FAILED_CYCLE_MARKER}"))] | length`,
  ]);
  return Number(out) || 0;
}

// Swap ready-for-agent → needs-triage and explain why, so the planner's label
// filter stops selecting the issue and a human triages with the failure trail
// already on the issue.
function parkIssue(issueId: string, body: string): boolean {
  try {
    runCmd("gh", [
      "issue",
      "edit",
      issueId,
      "--remove-label",
      "ready-for-agent",
      "--add-label",
      "needs-triage",
    ]);
    runCmd("gh", ["issue", "comment", issueId, "--body", body]);
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

// Shared failure accounting for gate holds (Phase 3) and publish failures
// (Phase 4): record the deterministic marker comment (the trail the next
// cycle's agents and the parking human both read), and on the Nth strike park
// the issue — bounded retry then escalate, at the task level.
function recordFailedCycleAndMaybePark(
  issue: PlannedIssue,
  reasons: string,
): { parked: boolean; attempts: number } {
  let attempts = 0;
  try {
    runCmd("gh", [
      "issue",
      "comment",
      issue.id,
      "--body",
      `${FAILED_CYCLE_MARKER}\nSandcastle failed cycle: ${reasons}`,
    ]);
    attempts = failedCycleCount(issue.id);
  } catch {
    // Comment failed (network, auth) — skip counting this cycle rather than
    // guessing; the branch itself is unaffected.
  }
  if (attempts >= MAX_ATTEMPTS) {
    const parked = parkIssue(
      issue.id,
      `Parked by Sandcastle after ${attempts} failed cycles (last: ${reasons}). ` +
        `The branch \`${issue.branch}\` is kept. A human should read the failure ` +
        "trail above and either fix the blocker or re-spec; re-add `ready-for-agent` " +
        "to hand it back to the agents.",
    );
    if (parked) {
      console.log(`  ⏸ #${issue.id} parked — ${attempts} failed cycles (cap ${MAX_ATTEMPTS})`);
    }
    return { parked, attempts };
  }
  return { parked: false, attempts };
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
// (base...branch) and refuse to publish when test files were deleted or
// skip/todo markers were added. Renames don't count (-M). A violation holds
// the branch back and counts as a failed cycle, so the attempt cap eventually
// escalates repeat offenders to a human.
function testIntegrityViolations(branch: string, base: string): string[] {
  const violations: string[] = [];
  try {
    const status = runCmd("git", ["diff", "--name-status", "-M", `${base}...${branch}`]);
    for (const line of status.split("\n")) {
      const [code, path] = line.split("\t");
      if (code?.startsWith("D") && path && TEST_FILE_RE.test(path)) {
        violations.push(`deleted test file: ${path}`);
      }
    }
    const diff = runCmd("git", ["diff", "-M", `${base}...${branch}`]);
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
        violations.push(`skip/todo added in ${file}: ${line.trim().slice(0, 100)}`);
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
    (SPEC_FILTER ? `, spec #${SPEC_FILTER}` : "") +
    (TOKEN_CEILING > 0 ? `, token ceiling ${compact(TOKEN_CEILING)}` : ""),
);

ensureLabels();
gitFetch();
// Keep every live spec current with main before planning against it —
// conflicts surface on the spec PRs and quarantine those specs.
syncSpecBranchesWithMain();

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  // origin/* refs are this cycle's ground truth: bases for new worktrees,
  // diffs for the gate, ahead-of-base checks. One fetch per cycle keeps them
  // honest after last cycle's merges (which all happened server-side).
  gitFetch();

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
    promptArgs: {
      SPEC_NOTE: SPEC_FILTER
        ? `IMPORTANT: this run is scoped to spec #${SPEC_FILTER}. Include ONLY issues ` +
          `whose "## Parent" section references #${SPEC_FILTER}; treat every other ` +
          `issue as out of scope. The orchestrator independently enforces this filter.`
        : "",
    },
    // Extract and validate the <plan> JSON into a typed object. Throws
    // StructuredOutputError if the tag is missing, the JSON is malformed, or
    // validation fails — which aborts the loop.
    output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
  });

  addTokens(cycleTokens, plan);

  // -------------------------------------------------------------------------
  // Phase 1.5: Route
  //
  // Deterministic spec resolution for every planned issue — parse "## Parent"
  // from the issue body, resolve the spec branch, enforce --spec, and drop
  // children of quarantined specs. The planner's output never routes a merge.
  // -------------------------------------------------------------------------
  const parents = fetchReadyIssueParents();
  const workableSpecs = new Map<string, boolean>();
  const routed: WorkItem[] = [];

  for (const issue of plan.output.issues) {
    const parentId = parentOfIssue(issue.id, parents);

    if (SPEC_FILTER && parentId !== SPEC_FILTER) {
      console.log(`  − #${issue.id} skipped — outside --spec ${SPEC_FILTER}`);
      continue;
    }

    if (parentId === null) {
      routed.push({ issue, spec: null, base: "origin/main" });
      continue;
    }

    const spec = resolveSpec(parentId);
    if (!spec) {
      console.log(`  − #${issue.id} skipped — parent #${parentId} could not be resolved`);
      continue;
    }

    if (!workableSpecs.has(spec.id)) {
      const status = specWorkability(spec);
      workableSpecs.set(spec.id, status.workable);
      if (!status.workable) {
        console.log(`  ⛔ spec #${spec.id} quarantined (${status.reason}) — children skipped`);
      }
    }
    if (!workableSpecs.get(spec.id)) continue;

    if (!ensureSpecBranchOnOrigin(spec)) {
      console.log(`  − #${issue.id} skipped — could not create ${spec.branch} on origin`);
      continue;
    }

    routed.push({ issue, spec, base: `origin/${spec.branch}` });
  }

  const work = routed.slice(0, MAX_PARALLEL);

  if (work.length === 0) {
    // No workable, unblocked work — done, all blocked, or all quarantined.
    console.log("No workable issues this cycle. Exiting.");
    foldTokens(runTokens, cycleTokens);
    runLog(`- run ended (cycle ${iteration}): no workable issues after routing`);
    break;
  }

  if (routed.length > work.length) {
    console.log(
      `Planner selected ${routed.length} issue(s); working the top ${work.length} (MAX_PARALLEL).`,
    );
  }

  console.log(`Planning complete. ${work.length} issue(s) to work in parallel:`);
  for (const item of work) {
    const path = item.spec ? item.spec.branch : "main (direct, human-merged)";
    console.log(`  ${item.issue.id}: ${item.issue.title} → ${item.issue.branch} → ${path}`);
  }

  // -------------------------------------------------------------------------
  // Phase 2: Execute + Review + Verify
  //
  // For each issue, create a sandbox via createSandbox() so the implementer,
  // reviewer, and verifier share the same sandbox instance per branch. The
  // worktree is cut from the issue's BASE ref (its spec branch, or main) —
  // and BASE_BRANCH is passed to the prompts explicitly, because sandcastle's
  // built-in TARGET_BRANCH resolves to the host's checked-out branch, which
  // is no longer the merge target of anything.
  //
  // Promise.allSettled means one failing pipeline doesn't cancel the others.
  // -------------------------------------------------------------------------

  const settled = await Promise.allSettled(
    work.map(async (item): Promise<PipelineResult> => {
      const { issue, base } = item;
      const sandbox = await sandcastle.createSandbox({
        branch: issue.branch,
        baseBranch: base,
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
            BASE_BRANCH: base,
          },
          completionSignal: [ARCHITECT_VERDICTS.ready, ARCHITECT_VERDICTS.blocked],
        });

        addTokens(tokens, architect);

        if (architect.completionSignal !== ARCHITECT_VERDICTS.ready) {
          // BLOCKED (the architect commented and re-labeled the issue) or no
          // verdict at all — either way there is no design to implement.
          return {
            work: item,
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
            BASE_BRANCH: base,
          },
          completionSignal: [
            IMPLEMENT_SIGNALS.complete,
            IMPLEMENT_SIGNALS.needsArchitect,
            IMPLEMENT_SIGNALS.alreadySatisfied,
            IMPLEMENT_SIGNALS.blocked,
          ],
        });

        addTokens(tokens, implement);

        if (implement.completionSignal === IMPLEMENT_SIGNALS.alreadySatisfied) {
          // Nothing to implement — the criteria are met by existing code (the
          // implementer left evidence as an issue comment). Skip the reviewer
          // and verifier: there is no diff to review. The orchestrator closes
          // the issue after the pipelines settle.
          return {
            work: item,
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
            work: item,
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
          // gate below decides publishability from branchIsAheadOfBase, not
          // from this run's commit count.
          return {
            work: item,
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
            BASE_BRANCH: base,
          },
          completionSignal: [REVIEW_VERDICTS.approve, REVIEW_VERDICTS.requestChanges],
        });

        // Independent verification: a cheap agent re-runs typecheck + tests
        // after the reviewer's edits and reports the real exit codes. This
        // catches both reviewer-introduced breakage and implementers that
        // claimed COMPLETE without green tests — before the branch spends a
        // CI round trip finding out the same thing.
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

        // Merge commits from both runs so Phase 4 sees all of them. Each
        // sandbox.run() only returns commits from its own run. (The verifier
        // is read-only and never commits.)
        return {
          work: item,
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
        `  ✗ ${work[i]!.issue.id} (${work[i]!.issue.branch}) failed: ${outcome.reason}`,
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
  // host, like the PR merges below: deterministic code, not a prompt
  // instruction. Closing is cycle progress — the next planner query no
  // longer sees the issue.
  const alreadySatisfied = results.filter((r) => r.alreadySatisfied);
  for (const { work: item } of alreadySatisfied) {
    try {
      runCmd("gh", [
        "issue",
        "close",
        item.issue.id,
        "--comment",
        "Closed by Sandcastle: acceptance criteria already met by existing code — evidence in the comments above.",
      ]);
      console.log(`  ✓ #${item.issue.id} closed — already satisfied`);
    } catch {
      console.error(
        `  ⚠ #${item.issue.id} reported already-satisfied but could NOT be ` +
          `closed — close it manually: gh issue close ${item.issue.id}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Phase 3: Gate
  //
  // Only branches that are complete, approved, and locally green go to
  // Phase 4. Branches with commits that fail any gate are held back — they
  // live on under their deterministic name, and the next cycle's implementer
  // resumes them (the issue stays open, so the planner re-selects it).
  // -------------------------------------------------------------------------

  // Deterministic test-integrity check, run only on branches that would
  // otherwise publish (two git diffs each — cheap). See
  // testIntegrityViolations() for the failure mode this guards.
  const integrityViolations = new Map<string, string[]>();
  for (const r of results) {
    if (
      !r.alreadySatisfied &&
      r.implementComplete &&
      r.reviewApproved &&
      r.checksPassed &&
      branchIsAheadOfBase(r.work.issue.branch, r.work.base)
    ) {
      const v = testIntegrityViolations(r.work.issue.branch, r.work.base);
      if (v.length > 0) integrityViolations.set(r.work.issue.branch, v);
    }
  }

  const publishable = results.filter(
    (r) =>
      branchIsAheadOfBase(r.work.issue.branch, r.work.base) &&
      r.implementComplete &&
      r.reviewApproved &&
      r.checksPassed &&
      !integrityViolations.has(r.work.issue.branch),
  );

  // Everything that didn't pass the gate gets reported — including pipelines
  // that produced no commits at all (an implementer that burned its iteration
  // budget without committing, or an architect that blocked the issue) so no
  // stuck issue goes unnoticed in the cycle summary.
  const heldBack = results.filter(
    (r) => !publishable.includes(r) && !r.alreadySatisfied,
  );

  let parked = 0;
  const heldSummaries: string[] = [];
  for (const r of heldBack) {
    const { issue } = r.work;
    const violations = integrityViolations.get(issue.branch);
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
    const suffix = branchIsAheadOfBase(issue.branch, r.work.base)
      ? " — branch kept for the next cycle"
      : "";
    console.log(`  ⏸ ${issue.branch} held back (${reasons})${suffix}`);

    // COMPLETE with nothing on the branch is the livelock signature: the
    // branch can never become ahead of base, so the gate will hold it back on
    // every future cycle too (the issue-22 failure mode — a parent/no-op
    // issue). ALREADY_SATISFIED is the well-behaved exit for that situation;
    // this is the backstop when the implementer says COMPLETE instead.
    if (r.implementComplete && !branchIsAheadOfBase(issue.branch, r.work.base)) {
      if (
        parkIssue(
          issue.id,
          "Parked by Sandcastle: the implementer signaled COMPLETE but produced no commits and the branch has no work to merge — likely already satisfied by existing code (possibly via child issues) or mis-specified. A human should close or re-spec it; re-add `ready-for-agent` to hand it back to the agents.",
        )
      ) {
        parked++;
        console.log(
          `  ⏸ #${issue.id} parked (ready-for-agent → needs-triage) — COMPLETE with no work to merge`,
        );
      }
      heldSummaries.push(`#${issue.id} parked (no-op COMPLETE)`);
      continue;
    }

    // Architect-BLOCKED issues already left the planner's pool via the
    // needs-info label swap the architect itself performs — no counter needed.
    if (r.note?.startsWith("architect blocked")) {
      heldSummaries.push(`#${issue.id} blocked by architect`);
      continue;
    }

    const outcome = recordFailedCycleAndMaybePark(issue, reasons);
    if (outcome.parked) {
      parked++;
      heldSummaries.push(`#${issue.id} parked (${outcome.attempts} failed cycles)`);
    } else {
      heldSummaries.push(
        `#${issue.id} held, attempt ${outcome.attempts}/${MAX_ATTEMPTS} (${reasons.slice(0, 80)})`,
      );
    }
  }

  console.log(
    `\nExecution complete. ${publishable.length} of ${results.length} branch(es) passed the gate.`,
  );

  // -------------------------------------------------------------------------
  // Phase 4: Publish
  //
  // No agent here — pushing, PR management, and merging are deterministic,
  // so the orchestrator does them directly (git and gh are authenticated on
  // the host). Pushes and PR creation happen first; then every PR's CI is
  // awaited in parallel (the fast gate takes ~3–6 min and the waits overlap);
  // then the outcomes are applied serially.
  //
  // execFileSync (no shell) throughout: branch names and issue ids originate
  // from planner model output and must never reach a shell.
  // -------------------------------------------------------------------------
  const merged: PlannedIssue[] = [];
  const handedOff: PlannedIssue[] = [];
  const skipped: PlannedIssue[] = [];
  const specsTouched = new Map<string, Spec>();

  type Publication = { result: PipelineResult; prNumber: number };
  const publications: Publication[] = [];

  console.log("");
  for (const r of publishable) {
    const { issue } = r.work;
    try {
      runCmd("git", ["push", "-u", "origin", issue.branch]);
    } catch (error) {
      // A branch that cannot reach origin cannot be published — held for the
      // next cycle, counted as a failed cycle so it can't silently loop.
      const outcome = recordFailedCycleAndMaybePark(
        issue,
        `push of ${issue.branch} failed: ${stderrOf(error).slice(0, 200)}`,
      );
      if (outcome.parked) parked++;
      heldSummaries.push(`#${issue.id} push failed`);
      continue;
    }
    const prNumber = ensureIssuePr(r.work);
    if (prNumber === null) {
      const outcome = recordFailedCycleAndMaybePark(
        issue,
        `could not create or find a PR for ${issue.branch}`,
      );
      if (outcome.parked) parked++;
      heldSummaries.push(`#${issue.id} PR creation failed`);
      continue;
    }
    console.log(`  ⇈ ${issue.branch} pushed — PR #${prNumber} awaiting CI`);
    publications.push({ result: r, prNumber });
  }

  const checkOutcomes = await Promise.all(
    publications.map((p) => waitForChecks(p.prNumber)),
  );

  for (const [i, publication] of publications.entries()) {
    const { result, prNumber } = publication;
    const { issue, spec } = result.work;
    const ci = checkOutcomes[i]!;

    if (ci !== "pass") {
      const reason =
        ci === "fail"
          ? `CI failed on PR #${prNumber}`
          : `CI did not finish within ${CHECKS_TIMEOUT_MS / 60_000} minutes on PR #${prNumber}`;
      console.log(`  ✗ ${issue.branch} — ${reason}`);
      const outcome = recordFailedCycleAndMaybePark(issue, reason);
      if (outcome.parked) {
        parked++;
        heldSummaries.push(`#${issue.id} parked (${outcome.attempts} failed cycles)`);
      } else {
        heldSummaries.push(
          `#${issue.id} held, attempt ${outcome.attempts}/${MAX_ATTEMPTS} (${reason})`,
        );
      }
      continue;
    }

    if (spec === null) {
      // Parentless issue, PR targets main: green means DONE from the agents'
      // side. The human merges; the label swap takes the issue out of the
      // planner's pool while it waits — and keeps it out if the human closes
      // the PR to reject the work (re-adding ready-for-agent is the explicit
      // hand-back).
      tryCmd("gh", [
        "issue",
        "edit",
        issue.id,
        "--remove-label",
        "ready-for-agent",
        "--add-label",
        IN_REVIEW_LABEL,
      ]);
      tryCmd("gh", [
        "issue",
        "comment",
        issue.id,
        "--body",
        `PR #${prNumber} is green and awaits human review. Merging it closes this issue.`,
      ]);
      handedOff.push(issue);
      console.log(
        `  ✓ ${issue.branch} green — PR #${prNumber} handed to human (${IN_REVIEW_LABEL})`,
      );
      continue;
    }

    const mergeOutcome = await mergePrWithRetry(prNumber);
    if (mergeOutcome !== "merged") {
      // Conflict with a sibling merged moments earlier — held, NOT a failed
      // cycle: the next cycle's implementer syncs the branch with its base
      // (see implement-prompt.md), where the test suite can validate the
      // resolution.
      skipped.push(issue);
      console.log(`  ✗ ${issue.branch} skipped — PR #${prNumber} did not merge cleanly`);
      continue;
    }

    merged.push(issue);
    specsTouched.set(spec.id, spec);
    console.log(`  ✓ ${issue.branch} squash-merged into ${spec.branch} (PR #${prNumber})`);

    // The remote branch is gone (--delete-branch); drop the local ref too.
    // After a squash the original commits are never in the base's ancestry,
    // so a lingering local ref would read as "ahead of base" forever — a
    // reopened issue would then resume a ghost branch instead of starting
    // clean.
    tryCmd("git", ["branch", "-D", issue.branch]);

    try {
      runCmd("gh", [
        "issue",
        "close",
        issue.id,
        "--comment",
        `Completed by Sandcastle — squash-merged into \`${spec.branch}\` via PR #${prNumber}.`,
      ]);
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

  // Every spec that received work keeps a spec→main PR: the fast gate re-runs
  // on it after the merges above (its combined-state CI), and a completed
  // spec graduates to the human's queue.
  for (const spec of specsTouched.values()) {
    const specPr = ensureSpecPr(spec);
    if (specPr !== null) {
      markSpecReadyIfDone(spec, specPr);
    }
  }

  console.log(
    `\nPublish phase done: ${merged.length} merged, ${handedOff.length} handed to human, ` +
      `${skipped.length} skipped${skipped.length > 0 ? " (held for the next cycle)" : ""}.`,
  );

  // Everything an agent could bill for in this cycle has run by now.
  foldTokens(runTokens, cycleTokens);

  runLog(
    `- ${new Date().toISOString()} cycle ${iteration}/${MAX_ITERATIONS} | ` +
      `planned [${work.map((i) => i.issue.id).join(",")}] | ` +
      `merged [${merged.map((i) => i.id).join(",")}] | ` +
      `handed [${handedOff.map((i) => i.id).join(",")}] | ` +
      `skipped [${skipped.map((i) => i.id).join(",")}] | ` +
      `closed [${alreadySatisfied.map((r) => r.work.issue.id).join(",")}] | ` +
      `held: ${heldSummaries.join("; ") || "none"} | ` +
      `tokens ${fmtTokens(cycleTokens)} | run-total ${compact(totalTokens(runTokens))}`,
  );

  // Did this cycle change anything the next cycle would see? Merges advance
  // spec branches; hand-offs, closes, and parks shrink the planner's pool;
  // new commits resume on held-back branches. If none of that happened, the
  // next cycle's inputs are identical to this one's — iterating again would
  // replay the exact same cycle (agents are the only nondeterminism, and
  // burning tokens on a coin flip is not a strategy). Stop loudly instead.
  const cycleMadeProgress =
    merged.length > 0 ||
    handedOff.length > 0 ||
    alreadySatisfied.length > 0 ||
    parked > 0 ||
    results.some((r) => r.commits.length > 0);
  if (!cycleMadeProgress) {
    console.log(
      "Stopping: cycle made no progress — nothing merged or handed off, no new " +
        "commits, no issues closed or parked. The next cycle's inputs would be " +
        "identical; see the held-back reasons above and resolve them before " +
        "re-running.",
    );
    runLog(`- run ended (cycle ${iteration}): no-progress breaker`);
    break;
  }

  // Budget check, cycle-boundary only (see TOKEN_CEILING note above).
  if (TOKEN_CEILING > 0 && totalTokens(runTokens) >= TOKEN_CEILING) {
    console.log(
      `Token ceiling reached (${compact(totalTokens(runTokens))} of ` +
        `${compact(TOKEN_CEILING)}) — stopping at the cycle boundary.`,
    );
    runLog(
      `- run ended (cycle ${iteration}): token ceiling ${compact(TOKEN_CEILING)} reached`,
    );
    break;
  }
}

runLog(
  `- run finished ${new Date().toISOString()} — total ${compact(totalTokens(runTokens))} tokens`,
);
console.log("\nAll done.");
