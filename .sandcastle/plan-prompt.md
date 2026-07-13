# ISSUES

Here are the open issues in the repo:

<issues-json>

!`gh issue list --state open --label ready-for-agent --limit 100 --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`

</issues-json>

The list above has already been filtered to issues ready for work.

# TASK

Analyze the open issues and build a dependency graph. For each issue, determine whether it **blocks** or **is blocked by** any other open issue.

You have the repository checked out. When it is unclear whether two issues touch the same files or modules, inspect the code to find out instead of guessing.

An issue B is **blocked by** issue A if:

- B requires code or infrastructure that A introduces
- B and A modify overlapping files or modules, making concurrent work likely to produce merge conflicts
- B's requirements depend on a decision or API shape that A will establish

An issue is **unblocked** if it has zero blocking dependencies on other open issues.

For each unblocked issue, assign a branch name using the exact format `sandcastle/issue-{id}` (no slug or other suffix). This must be deterministic so that re-planning the same issue always produces the same branch name and accumulated progress is preserved.

# OUTPUT

Output your plan as a JSON object wrapped in `<plan>` tags:

<plan>
{"issues": [{"id": "42", "title": "Fix auth bug", "branch": "sandcastle/issue-42"}]}
</plan>

Include only unblocked issues, ordered most-important-first: put issues that unblock the most other issues (or carry the highest priority labels) at the top. The orchestrator caps how many run in parallel and takes them from the top of your list.

If every issue is blocked, do NOT pick one anyway. An issue whose blocker is still open gets stranded: the merge gate holds its branch until the blocker lands, and the implementer burns its entire iteration budget re-confirming the blocker. Emit an empty plan instead, and before the `<plan>` tags name the bottleneck issue(s) a human must unstick. Exception: two ready issues that block only each other through file overlap are an ordering decision, not a block — surface the higher-leverage one as usual.

Always emit the `<plan>` tags, even when there is nothing to do. If there are no issues to work on at all, output `<plan>{"issues": []}</plan>` so the run can exit cleanly.
