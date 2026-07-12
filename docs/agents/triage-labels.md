# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker (GitHub).

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

These are the defaults — the role name equals the label string. `wontfix` is a GitHub built-in; the other four don't exist in the repo yet, so create them on first use (`gh label create <name>`) or via the GitHub UI. Edit the right-hand column if you later adopt different vocabulary.

## Repo-specific labels

| Label      | Meaning                                                        |
| ---------- | -------------------------------------------------------------- |
| `tracking` | Parent/umbrella issue (a spec or epic) whose work lands through child issues |

`tracking` is never combined with `ready-for-agent`: there is nothing to implement on the issue itself, and an agent that selects it will livelock — it produces no commits, so its branch can never pass the merge gate, and the planner re-selects it every cycle. When breaking a spec into tickets, label the parent `tracking` and give `ready-for-agent` only to the child tickets that carry implementable work. Close a `tracking` issue when all of its children are closed.
