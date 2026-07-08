# TASK

Implement issue {{TASK_ID}}: {{ISSUE_TITLE}}

Pull in the issue and its discussion using `gh issue view {{TASK_ID}} --comments`.

An architect has already designed this change: the newest issue comment starting with `<!-- sandcastle:design -->` is your specification. Follow it exactly — the files it names, the code it says to reuse, the tests it asks for, the scope it draws. Do not redesign, do not substitute your own approach, and do not build from scratch anything the design says to reuse.

Comments may also contain progress notes or review feedback from a previous cycle — treat unresolved feedback as part of the task.

Only work on the issue specified.

# BRANCH

Work on branch {{BRANCH}}. It may already contain partial work from a previous cycle: check `git log {{TARGET_BRANCH}}..HEAD --oneline` first, and if there are commits, continue from where they left off instead of starting over.

Then sync with the target branch: if `git log HEAD..{{TARGET_BRANCH}} --oneline` shows commits, run `git merge {{TARGET_BRANCH}} --no-edit`, resolve any conflicts, and confirm `pnpm typecheck` passes on the merge result before continuing. A finished branch that sits on a stale base gets stuck at the merge phase — sync early, while you can still run the tests.

# CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# EXPLORATION

Read the files the design names — and their existing tests — before changing them. CLAUDE.md and docs/architecture/ are the source of truth for conventions.

If you need to locate something the design didn't name, a code graph is available: `graphify query "<question>"` or `graphify explain "<Symbol>"` (fall back to grep if it's missing).

# EXECUTION

If applicable, use RGR to complete the task.

1. RED: write one test
2. GREEN: write the implementation to pass that test
3. REPEAT until done
4. REFACTOR the code

# FEEDBACK LOOPS

Before committing, run `pnpm typecheck` and `pnpm test` to ensure the tests pass.

If you changed anything under `packages/*`, add a changeset: write a file at `.changeset/<short-slug>.md` with frontmatter mapping each changed package to a bump type, then a one-line summary. Example:

```md
---
"@repo/billing": patch
---

Fix webhook retry backoff.
```

Do not run the interactive `pnpm changeset` CLI.

# COMMIT

Make a git commit using Conventional Commits format: `type(scope): summary (#{{TASK_ID}})`. The body must briefly note:

1. Key decisions made
2. Blockers or notes for the next iteration

Keep it concise.

# THE ISSUE

If the task is not complete, leave a comment on the issue with what was done and what remains.

Do not close the issue - this will be done later.

# COMPLETION

Output <promise>COMPLETE</promise> ONLY when all of the following are true:

- The issue's acceptance criteria are fully met
- `pnpm typecheck` and `pnpm test` pass
- All work is committed

Output <promise>NEEDS_ARCHITECT</promise> when the design cannot be executed as written — it names code that doesn't exist, its approach cannot pass the tests, or the issue's acceptance criteria aren't covered by it. Do NOT improvise a redesign. Instead: commit any safe partial work, comment on the issue describing exactly where the design breaks down (quote the design section and the reality that contradicts it), then emit the signal so the architect revises the design next cycle.

If neither applies — the work is simply unfinished — end WITHOUT any signal; the loop will run you again and you can continue.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
