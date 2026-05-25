# ai-harness

`ai-harness` scaffolds a shared Codex + Claude workflow for existing repositories and fresh projects.

## Install

```bash
npm install
npm run build
npm link
```

## Commands

- `ai-harness init`
- `ai-harness retrofit [--dry-run] [--merge] [--force]`
- `ai-harness doctor`
- `ai-harness index`
- `ai-harness search "query" [--json] [--top-k 3]`

## Retrofit behavior

- `--dry-run`: previews create/update/skip changes with real before/after diffs and makes no filesystem changes.
- `--merge`: merges managed sections for `AGENTS.md` and `CLAUDE.md`.
- `--force`: overwrites managed files that are otherwise protected.

## Generated tree (high level)

- `.ai/` plans, reviews, handoffs, rag index artifacts
- `.claude/` hook settings, hook scripts, and skills
- `docs/` architecture, ADRs, runbooks, knowledge stubs
- `scripts/rag/` local RAG support docs

## Claude hooks

Generated `.claude/settings.json` uses Claude Code `PreToolUse` and `PostToolUse` event schema.

- `PreToolUse` + `Bash` matcher calls `block-dangerous-bash.sh`.
- `PostToolUse` + `Edit|MultiEdit|Write` matcher calls `after-edit-check.sh`.

`block-dangerous-bash.sh` parses hook JSON from stdin and denies known destructive commands such as `rm -rf`, `git reset --hard`, `git clean -fd`, and `docker system prune`.

## RAG configuration

Configure in `ai-harness.config.yaml`:

- `rag.include`: files/dirs to index
- `rag.exclude`: extra paths to exclude (in addition to built-in safety exclusions)

Markdown is chunked by headings, while code/data files are chunked by line windows.

## Minimizing Claude tokens

`ai-harness search` exists to keep Claude (and other agents) retrieval-first: find the smallest relevant context before opening files.

Recommended flow:

1. `ai-harness index`
2. `ai-harness search "<feature or error>"`
3. inspect only the returned file paths and line ranges
4. record findings in `.ai/retrieval-notes/`

Generated projects include a Claude retrieval nudge hook (`Read|Glob|Grep`) that allows tool use, but adds context reminding Claude to search first when a broad read is detected.

Known limitations:

- local keyword search is lexical (not semantic), so query phrasing matters.
- ranking is heuristic and may miss intent if symbols are renamed or uncommon.
- large repos may still require multiple focused queries to converge quickly.

## Task orchestration

`ai-harness task` provides a deterministic Git-native workflow using `.ai/tasks/<task-id>/task.yaml` as source of truth.

Flow:

```bash
ai-harness task create user-auth --prompt "Add email/password authentication with protected routes"
ai-harness task context user-auth
ai-harness task claude user-auth
# run Claude manually
ai-harness task commit user-auth
ai-harness task codex-review user-auth
# run Codex manually
ai-harness task hardening user-auth
# run Claude manually
ai-harness task commit user-auth --phase hardening
ai-harness task pr user-auth --draft
```

Artifacts under `.ai/tasks/<task-id>` capture prompt, bounded context, implementation notes, test evidence, Codex review, hardening instructions, and PR body. Claude is responsible for implementation/hardening; Codex is responsible for review-only feedback. Commit/PR commands enforce branch, clean-tree, checks, and review gates. If `gh` is unavailable, `task pr` prints a safe fallback command.
