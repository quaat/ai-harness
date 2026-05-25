# ai-harness

`ai-harness` scaffolds and validates a retrieval-first Claude + Codex workflow. It helps teams run a semi-manual, Git-native loop where Claude implements/tests and Codex plans/reviews/hardens through durable task artifacts under `.ai/`.

## Project overview

`ai-harness` is for engineering teams that want dependable AI-assisted delivery without hidden orchestration. It solves common problems:
- prompts and review notes scattered in chat history,
- unclear ownership between implementation and review,
- weak reproducibility across handoffs,
- missed quality gates before PRs.

Claude Code and Codex collaborate through files and Git state:
- Claude: implementation and testing from bounded context.
- Codex: review, risk finding, hardening guidance.
- `ai-harness`: creates prompts, tracks state, enforces checks, and keeps artifacts versioned.

Why files + Git as durable state:
- inspectable by humans,
- diffable in PRs,
- replayable for audits,
- stable across tool sessions.

What it does **not** do: invoke Claude/Codex directly, auto-merge, auto-approve reviews, or run background agents.

```text
task prompt
  -> bounded RAG context
  -> Claude implementation prompt
  -> local checks + commit
  -> Codex review prompt
  -> Claude hardening prompt
  -> final checks + PR
```

## Installation and development setup

```bash
npm install
npm run build
npm link
ai-harness --help
```

Development loop:

```bash
npm run typecheck
npm test
npm run build
```

Required tools:
- Node.js
- npm
- Git
- `jq` (for generated Claude hook scripts)
- optional `gh` (for PR creation)

If `gh` is unavailable or unauthenticated, `ai-harness task pr` prints a safe fallback `gh pr create ...` command.

## Fresh project walkthrough

```bash
mkdir my-app
cd my-app
git init
git config user.email "you@example.com"
git config user.name "Your Name"

ai-harness init
ai-harness doctor
ai-harness index
```

Create and start a task:

```bash
ai-harness task create user-auth \
  --prompt "Add email/password authentication with protected routes"

ai-harness task context user-auth
ai-harness task claude user-auth
```

`init` creates the AI harness (artifacts, prompts, hooks, config), not a framework app scaffold like Next.js/FastAPI/Rails.

## Existing repo retrofit walkthrough

```bash
cd existing-project

ai-harness retrofit --dry-run
ai-harness retrofit --merge
ai-harness doctor
ai-harness index
```

- `--dry-run`: no filesystem changes.
- `--merge`: appends/replaces managed blocks in `AGENTS.md` and `CLAUDE.md`.
- `--force`: destructive overwrite of managed files—use carefully.
- Existing application code is not rewritten.
- Existing instructions are preserved where possible.

Recommended first task:

```bash
ai-harness task create repo-overview \
  --prompt "Review the current architecture and identify the safest first improvement"
```

## Full Claude + Codex workflow

```bash
ai-harness task create user-auth \
  --prompt "Add email/password authentication with protected routes"

ai-harness task context user-auth
ai-harness task claude user-auth
```

Paste `.ai/tasks/user-auth/claude-implement.md` into Claude Code. Claude should implement, test, and write:
- `.ai/tasks/user-auth/implementation.md`
- `.ai/tasks/user-auth/tests.md`

Then:

```bash
ai-harness task commit user-auth
ai-harness task codex-review user-auth
```

Paste `.ai/tasks/user-auth/codex-review-prompt.md` into Codex. Codex should write `.ai/tasks/user-auth/codex-review.md`.

Then:

```bash
ai-harness task hardening user-auth
```

Paste `.ai/tasks/user-auth/claude-fix-instructions.md` into Claude. Claude applies required fixes and writes `.ai/tasks/user-auth/hardening.md`.

Then:

```bash
ai-harness task commit user-auth --phase hardening
ai-harness task pr user-auth --draft
```

Expected behavior:
- implementation and metadata are committed separately,
- PR artifacts may need to be committed before PR creation,
- `task pr` leaves a clean tree after successful PR creation.

## Task artifact layout

```text
.ai/tasks/user-auth/
  task.yaml
  prompt.md
  context.md
  claude-implement.md
  implementation.md
  tests.md
  codex-review-prompt.md
  codex-review.md
  claude-fix-instructions.md
  hardening.md
  pr.md
```

- `task.yaml`: source of truth for task state, checks, commits, branch, and artifact paths.
- `prompt.md`: original task prompt.
- `context.md`: bounded RAG context from indexed search.
- `claude-implement.md`: copy-ready Claude implementation prompt.
- `implementation.md`: Claude implementation notes.
- `tests.md`: check/test outputs and failures.
- `codex-review-prompt.md`: copy-ready Codex review prompt.
- `codex-review.md`: Codex review findings and requirements.
- `claude-fix-instructions.md`: deterministic hardening instructions extracted from review.
- `hardening.md`: Claude hardening summary.
- `pr.md`: generated PR body.

## Minimizing Claude tokens

Broad repository reads waste tokens and often dilute signal. Use lexical retrieval to create a bounded packet first.

Why this works:
- `ai-harness search` narrows to likely-relevant chunks.
- `task context` creates a focused context packet.
- generated prompts tell Claude exactly what to read.
- retrieval notes can be reused by future tasks.

Recommended flow:

```bash
ai-harness index
ai-harness search "auth login route"
ai-harness task context user-auth --query "auth login route"
```

Tips:
- search exact error messages,
- search symbols/functions/classes,
- include domain terms,
- inspect top 3–5 results first,
- do not paste entire directories into Claude.

Limitations: lexical search can miss semantic matches and refactors; always perform human code review.

## Troubleshooting

### `jq` is missing

Generated Claude hooks use `jq` for JSON parsing/emission. `ai-harness doctor` warns if missing.

```bash
brew install jq
sudo apt-get install jq
```

### `gh` is missing or not authenticated

`gh` is optional. If missing/unauthenticated, `task pr` prints fallback PR command.

```bash
gh auth login
```

### Missing RAG index

Error:

```text
Missing .ai/rag/index.jsonl. Run `ai-harness index` first.
```

Fix:

```bash
ai-harness index
```

### Dirty working tree

Common causes: uncommitted code, generated `pr.md`, updated task metadata, or post-check Claude edits.

```bash
git status
git diff
git add -A
git commit -m "..."
```

### Failed checks

`task commit` runs checks first. Failures are written to `.ai/tasks/<task-id>/tests.md`. Fix issues, rerun local tests, then rerun `task commit`.

### Secret file refused

`task commit` blocks likely secrets (for example `.env`, `*.pem`, `*.key`, `id_rsa`, `credentials.json`, `secrets.yml`). Remove/ignore/relocate them before committing.

## Security model and limitations

- No LLM calls are made by the tool.
- No direct Claude/Codex invocation.
- No background agents.
- No automatic merge.
- No automatic approval of Codex reviews.
- Secret-like files are blocked from task commits.
- RAG indexing skips built-in secret patterns.
- Generated Claude hooks block obvious dangerous shell commands.
- Hooks are guardrails, not a full sandbox.
- Users must review generated code before merge.
- Lexical RAG is not a substitute for full code review.
- `--force` can overwrite managed files and should be used carefully.

## Command reference

- `ai-harness init`: create harness files in current repo.
- `ai-harness retrofit [--dry-run] [--merge] [--force]`: retrofit existing repo.
- `ai-harness doctor [--json]`: validate setup and dependencies.
- `ai-harness index`: build local lexical RAG index.
- `ai-harness search "<query>" [--json] [--top-k N]`: retrieve relevant chunks.
- `ai-harness task create <id> --prompt "..." [--no-branch]`: create task workspace/branch.
- `ai-harness task status <id> [--json]`: show status summary and next step.
- `ai-harness task context <id> [--query "..."]`: write bounded context packet.
- `ai-harness task claude <id>`: generate Claude implementation prompt.
- `ai-harness task codex-review <id>`: generate Codex review prompt.
- `ai-harness task hardening <id>`: generate Claude hardening instructions.
- `ai-harness task commit <id> [--phase implementation|hardening] [--no-checks]`: run checks and commit.
- `ai-harness task pr <id> [--draft] [--skip-review]`: generate PR body and open PR with `gh` when available.
