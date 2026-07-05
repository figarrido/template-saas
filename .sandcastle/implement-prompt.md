# TASK

Fix issue {{TASK_ID}}: {{ISSUE_TITLE}}

Pull in the issue and its discussion using `gh issue view {{TASK_ID}} --comments`. If it has a parent PRD, pull that in too. Comments may contain progress notes or review feedback from a previous cycle — treat unresolved feedback as part of the task.

Only work on the issue specified.

Work on branch {{BRANCH}}. This branch may already contain partial work from a previous cycle: check `git log {{TARGET_BRANCH}}..HEAD --oneline` first, and if there are commits, continue from where they left off instead of starting over.

# CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

CLAUDE.md and docs/architecture/ are the source of truth for conventions — follow them.

Pay extra attention to test files that touch the relevant parts of the code.

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

If any of those are false, end WITHOUT the promise tag — the loop will run you again and you can continue.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
