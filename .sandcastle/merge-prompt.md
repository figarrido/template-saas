# TASK

Merge the following branches into the current branch:

{{BRANCHES}}

Every branch listed here has already passed code review and a typecheck + test gate on its own. Your job is only to merge them cleanly.

For each branch, in order:

1. Run `git merge <branch> --no-edit`
2. If there are merge conflicts, resolve them by reading both sides and choosing the correct resolution
3. If a conflict is too entangled to resolve confidently, run `git merge --abort`, skip the branch, and note it in your report — do not guess

# ENVIRONMENT LIMITS

This repo's node_modules belongs to the host machine and does not match this container. Do NOT run `pnpm install`, `pnpm test`, `pnpm typecheck`, or anything else that executes or modifies node_modules. Use only `git` and `gh`.

Because you cannot run the test suite here, be conservative: prefer skipping a conflicted branch over inventing a resolution. Skipped branches are retried next cycle.

# CLOSE ISSUES

For each branch that you actually merged, close its issue:

`gh issue close <ID> --comment "Completed by Sandcastle"`

Do NOT close issues for branches you skipped.

Here are all the issues:

{{ISSUES}}

# REPORT

End with a short report: branches merged, branches skipped and why, issues closed. Then output <promise>COMPLETE</promise>.
