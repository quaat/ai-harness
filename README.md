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
