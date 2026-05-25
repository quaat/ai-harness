# ai-harness

CLI to scaffold a dual-agent (Codex + Claude) workflow with local RAG, doctor checks, and retrofit-safe file generation.

## Commands
- `ai-harness init`
- `ai-harness retrofit --dry-run --merge --force`
- `ai-harness doctor`
- `ai-harness index`
- `ai-harness search <query> --json --top-k 10`

## Safety
- Retrofit defaults to create/skip behavior unless merge or force is requested.
- RAG indexing skips common secret and artifact paths.
