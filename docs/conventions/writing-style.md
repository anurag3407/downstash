---
title: Writing style
status: stable
last_updated: 2026-10-11
updated_by: P0-T2
code_paths:
  - plan.md
---

# Writing style

> How prose reads in this repo. Docs, comments, commits and progress notes.

## Audience

A competent engineer or agent who is new to Downstash. Assume TypeScript and
SQL literacy; assume no Downstash knowledge.

## Voice

- Second person, present tense, active voice: "The gateway hashes the token",
  not "The token will be hashed".
- Lead with the answer. Background comes after, if at all.
- One idea per paragraph, four sentences maximum.
- Prefer tables and numbered steps over prose.
- Use the glossary terms exactly. Code identifiers in backticks. File
  references as relative markdown links.
- No marketing language: no "blazing", "seamless", "simply", "just".
- Numbers as the UI shows them: `500 MB`, `60 s`, `$0.00`, `100,000`.
- Dates ISO: `2026-10-11`.
- At most two GitHub alerts per doc (`> [!NOTE]`, `> [!WARNING]`).
- Docs headings are sentence case. UI copy is uppercase — that is a different
  rule and lives in `docs/design/copy.md`.

## Code comments

- `@file` header on every source file: one line of what plus the §-reference.
- TSDoc on every export: one-line summary, then `@param` / `@returns` /
  `@throws` when non-obvious.
- SQL doc blocks on every function (`Command` / `Syntax` / `Returns` /
  `Errors`, or `Purpose` / `Params` / `Returns`), plus `comment on function`.
- Comment why, invariants and gotchas. Never narrate what the next line does.
- A `TODO` must reference a task ID or issue: `TODO(P9-T2): …`. No bare TODOs.

## Commit messages

Conventional Commits, scope from `docs/conventions/git.md`:

```
feat(db): add hash commands HSET..HINCRBYFLOAT [P1-T5]

Optional body: why, and which docs were updated.
```

## Progress notes

`docs/progress.md`, one block per task:

```markdown
### P3-T2 — Storage adapter, parsing, command routes

- **Status:** DONE
- **Summary:** bullet, bullet, bullet
- **Files:** paths that changed
- **Deviations:** what differs from plan.md and why
- **Follow-ups:** what the next agent should know
- **Verification:** the commands you ran and the summarised output
```

## Related

- [documentation.md](./documentation.md) · [git.md](./git.md)
