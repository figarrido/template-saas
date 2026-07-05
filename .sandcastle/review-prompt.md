# TASK

Review the code changes on branch `{{BRANCH}}`, which implement issue {{TASK_ID}}: {{ISSUE_TITLE}}. Improve code clarity, consistency, and maintainability, verify the change does what the issue asks, and deliver a verdict.

# CONTEXT

## The issue

Pull the issue and its acceptance criteria with `gh issue view {{TASK_ID}} --comments`.

## Branch diff

!`git diff {{TARGET_BRANCH}}...{{BRANCH}}`

## Commits on this branch

!`git log {{TARGET_BRANCH}}..{{BRANCH}} --oneline`

# REVIEW PROCESS

1. **Understand the change**: Read the diff and commits above to understand the intent.

2. **Check the spec**: Does the diff actually satisfy the issue's acceptance criteria? Unmet criteria are grounds for REQUEST_CHANGES, not silent approval.

3. **Analyze for improvements**: Look for opportunities to:
   - Reduce unnecessary complexity and nesting
   - Eliminate redundant code and abstractions
   - Improve readability through clear variable and function names
   - Consolidate related logic
   - Remove unnecessary comments that describe obvious code
   - Avoid nested ternary operators - prefer switch statements or if/else chains
   - Choose clarity over brevity - explicit code is often better than overly compact code

4. **Check correctness**:
   - Does the implementation match the intent? Are edge cases handled?
   - Are new/changed behaviours covered by tests?
   - Are there unsafe casts, `any` types, or unchecked assumptions?
   - Does the change introduce injection vulnerabilities, credential leaks, or other security issues?

5. **Maintain balance**: Avoid over-simplification that could:
   - Reduce code clarity or maintainability
   - Create overly clever solutions that are hard to understand
   - Combine too many concerns into single functions or components
   - Remove helpful abstractions that improve code organization
   - Make the code harder to debug or extend

6. **Apply project standards**: Follow the coding standards defined in @.sandcastle/CODING_STANDARDS.md

7. **Preserve intended behavior**: When refactoring, never change what the code does — only how it does it. Fixing a genuine bug or a small unmet acceptance criterion is allowed when the fix is clearly correct; anything larger belongs in REQUEST_CHANGES.

# EXECUTION

If you find improvements to make:

1. Make the changes directly on this branch
2. Run `pnpm typecheck` and `pnpm test` to ensure nothing is broken
3. Commit describing the refinements (Conventional Commits format)

If the code is already clean and well-structured, make no changes.

# VERDICT

End with exactly one verdict tag:

- <verdict>APPROVE</verdict> — the change satisfies the issue and is ready to merge (including any fixes you committed).
- <verdict>REQUEST_CHANGES</verdict> — gaps remain that you could not safely fix. Before emitting this, leave a comment on the issue (`gh issue comment {{TASK_ID}}`) describing exactly what remains, so the next implementation cycle picks it up.
