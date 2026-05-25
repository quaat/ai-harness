# ai-harness

CLI to scaffold a dual-agent (Codex + Claude) workflow with local RAG, doctor checks, and retrofit-safe file generation.

## Requirements
- Node.js 20+
- npm
- jq (required by generated Claude hook scripts)

## Commands
- `ai-harness init`
- `ai-harness retrofit --dry-run --merge --force`
- `ai-harness doctor`
- `ai-harness index`
- `ai-harness search <query> --json --top-k 10`

## Safety
- Retrofit defaults to create/skip behavior unless merge or force is requested.
- RAG indexing skips common secret and artifact paths.
- Generated Claude hooks block dangerous bash patterns and surface post-edit check status.

## Development workflow
- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run build`
