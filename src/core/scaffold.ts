import fs from "fs-extra";
import path from "node:path";
import YAML from "yaml";
import { createTwoFilesPatch } from "diff";
import type { DetectedProject, HarnessOptions, ScaffoldChange, WritePolicy } from "./types.js";

const START = "<!-- ai-harness:start -->";
const END = "<!-- ai-harness:end -->";

const REQUIRED_DIRS = [
  ".ai/plans", ".ai/reviews", ".ai/handoffs", ".ai/decisions", ".ai/retrieval-notes", ".ai/rag", ".ai/prompts", ".ai/tasks",
  ".claude/skills/implement-plan", ".claude/skills/retrieve-context", ".claude/skills/verify-change", ".claude/skills/prepare-codex-review",
  ".claude/hooks", "docs/architecture", "docs/adr", "docs/knowledge", "docs/runbooks", "scripts/rag"
];

function managedDoc(title: string, body: string) {
  return `# ${title}\n\n${START}\n${body}\n${END}\n`;
}

function mergeManaged(existing: string, nextBlockDoc: string): string {
  const m = nextBlockDoc.match(new RegExp(`${START}[\\s\\S]*${END}`));
  if (!m) return existing;
  if (existing.includes(START) && existing.includes(END)) return existing.replace(new RegExp(`${START}[\\s\\S]*${END}`), m[0]);
  return `${existing.trimEnd()}\n\n${m[0]}\n`;
}

async function writeManaged(root: string, rel: string, content: string, policy: WritePolicy, dryRun: boolean, changes: ScaffoldChange[]) {
  const target = path.join(root, rel);
  const exists = await fs.pathExists(target);
  if (!exists) {
    changes.push({ path: rel, action: "create", reason: "new file", before: "", after: content });
    if (!dryRun) await fs.writeFile(target, content);
    return;
  }

  const current = await fs.readFile(target, "utf8").catch(() => "");
  let next = content;

  if (policy === "skip" || policy === "create") {
    changes.push({ path: rel, action: "skip", reason: `exists (${policy})`, before: current, after: current });
    return;
  }

  if (policy === "merge") next = mergeManaged(current, content);
  if (next === current) {
    changes.push({ path: rel, action: "skip", reason: policy === "merge" ? "no changes after merge" : "no changes", before: current, after: current });
    return;
  }

  changes.push({ path: rel, action: "update", reason: policy, before: current, after: next });
  if (!dryRun) await fs.writeFile(target, next);
}

export async function scaffoldHarness(root: string, detected: DetectedProject, options: HarnessOptions): Promise<ScaffoldChange[]> {
  const changes: ScaffoldChange[] = [];
  if (!options.dryRun) for (const dir of REQUIRED_DIRS) await fs.ensureDir(path.join(root, dir));
  const docPolicy: WritePolicy = options.force ? "overwrite" : options.merge ? "merge" : "create";
  const safePolicy: WritePolicy = options.force ? "overwrite" : "skip";

  const config = {
    version: 1,
    project: { name: "auto", stack: detected.stack, packageManager: detected.packageManager },
    agents: { codex: { enabled: options.agents.includes("codex") }, claude: { enabled: options.agents.includes("claude") } },
    rag: {
      backend: "local-jsonl",
      include: ["docs", "src", "test", "README.md", "AGENTS.md", "CLAUDE.md", "package.json", "pyproject.toml", "go.mod"],
      exclude: ["node_modules", "dist", "build", "coverage", ".git", ".env", ".env.*", "**/*.pem", "**/*.key"]
    },
    commands: detected.commands
  };

  await writeManaged(root, "ai-harness.config.yaml", YAML.stringify(config), options.force ? "overwrite" : "create", Boolean(options.dryRun), changes);
  await writeManaged(root, "AGENTS.md", managedDoc("AGENTS", "Shared operating manual for Codex and Claude.\n\n## Workflow\n1. Plan in .ai/plans\n2. Implement in .ai/handoffs\n3. Review in .ai/reviews\n\n## Context minimization\n- Run `ai-harness search \"<query>\"` before broad reads.\n- Avoid loading large files unless search results indicate relevance.\n- Prefer targeted paths and line ranges over full-file reads.\n- Record useful findings in `.ai/retrieval-notes/<task-id>.md`.\n- Avoid pasting large docs into prompts.\n- Summarize only the minimal context needed for the next step."), docPolicy, Boolean(options.dryRun), changes);
  await writeManaged(root, "CLAUDE.md", managedDoc("Claude Code instructions", "@AGENTS.md\n\nRetrieval-first workflow:\n- Use `@AGENTS.md` as the operating manual.\n- Use `.claude/skills/retrieve-context/SKILL.md` before broad inspection.\n- Prefer `ai-harness search` over wide `Read`, `Glob`, or `Grep` operations.\n- If unsure where to look, stop and search first.\n- Keep implementation prompts and handoffs concise."), docPolicy, Boolean(options.dryRun), changes);

  const skills: Record<string, string> = {
    "implement-plan": "---\nname: implement-plan\ndescription: Execute approved plan safely\n---\nRead plan, implement smallest safe change, update handoff notes.",
    "retrieve-context": "---\nname: retrieve-context\ndescription: Fetch targeted context from local RAG\n---\n## When to use\nUse this before broad inspection, especially when the target files are unclear.\n\n## Query quality\n- Start with feature/error terms and key symbols (function/class/file names).\n- Add stack-specific words to disambiguate (e.g., route, hook, test, migration).\n- Run 1-3 focused queries instead of one broad query.\n\n## Retrieval loop\n1. Run `ai-harness search \"<query>\"`.\n2. Inspect only the top 3-5 results first.\n3. Capture findings in `.ai/retrieval-notes/<task-id>.md`.\n4. Read exact files only after search identifies relevant paths/line ranges.\n\n## Output format\n- Query used\n- Relevant chunks\n- Files/line ranges to inspect\n- What not to read\n- Open questions",
    "verify-change": "---\nname: verify-change\ndescription: Validate quality gates before review\n---\nRun lint/typecheck/test/build and summarize failures with fixes.",
    "prepare-codex-review": "---\nname: prepare-codex-review\ndescription: Package implementation for Codex review\n---\nSummarize changes, tests, risks, and open questions in .ai/reviews."
  };
  for (const [name, text] of Object.entries(skills)) await writeManaged(root, `.claude/skills/${name}/SKILL.md`, `${text}\n`, safePolicy, Boolean(options.dryRun), changes);

  const hookSettings = {
    hooks: {
      PreToolUse: [
        { matcher: "Bash", hooks: [{ type: "command", command: "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-dangerous-bash.sh" }] },
        { matcher: "Read|Glob|Grep", hooks: [{ type: "command", command: "${CLAUDE_PROJECT_DIR}/.claude/hooks/nudge-retrieve-context.sh" }] }
      ],
      PostToolUse: [{ matcher: "Edit|MultiEdit|Write", hooks: [{ type: "command", command: "${CLAUDE_PROJECT_DIR}/.claude/hooks/after-edit-check.sh" }] }]
    }
  };
  await writeManaged(root, ".claude/settings.json", JSON.stringify(hookSettings, null, 2) + "\n", safePolicy, Boolean(options.dryRun), changes);
  await writeManaged(root, ".claude/hooks/block-dangerous-bash.sh", `#!/usr/bin/env bash
set -euo pipefail
payload="$(cat)"
cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')"
blocked_regex='(^|[;&|[:space:]])rm[[:space:]]+-rf([[:space:]]|$)|git[[:space:]]+reset[[:space:]]+--hard|git[[:space:]]+clean[[:space:]]+-fd|docker[[:space:]]+system[[:space:]]+prune'
if [[ "$cmd" =~ $blocked_regex ]]; then
  jq -n --arg cmd "$cmd" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":("Blocked potentially destructive command: " + $cmd)}}'
  exit 0
fi
jq -n '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
`, safePolicy, Boolean(options.dryRun), changes);
  await writeManaged(root, ".claude/hooks/nudge-retrieve-context.sh", `#!/usr/bin/env bash
set -euo pipefail
payload="$(cat)"
name="$(printf '%s' "$payload" | jq -r '.tool_name // ""')"
input="$(printf '%s' "$payload" | jq -c '.tool_input // {}')"
nudge=""
if [[ "$name" == "Read" ]]; then
  file_path="$(printf '%s' "$input" | jq -r '.file_path // ""')"
  if [[ "$file_path" == "." || "$file_path" == "./" || "$file_path" == "/" ]]; then
    nudge="Broad read detected (\${name} \${file_path}). Run ai-harness search \"<query>\" first, then read only targeted paths/line ranges."
  fi
elif [[ "$name" == "Glob" ]]; then
  pattern="$(printf '%s' "$input" | jq -r '.pattern // ""')"
  if [[ "$pattern" == "**/*" || "$pattern" == "*" ]]; then
    nudge="Wide glob detected (\${pattern}). Run ai-harness search \"<query>\" first and narrow files before reading."
  fi
elif [[ "$name" == "Grep" ]]; then
  path_hint="$(printf '%s' "$input" | jq -r '.path // .dir // ""')"
  include_hint="$(printf '%s' "$input" | jq -r '.include // .glob // ""')"
  if [[ "$path_hint" == "." || "$path_hint" == "./" || "$path_hint" == "" ]] && [[ "$include_hint" == "" ]]; then
    nudge="Broad grep from project root detected. Run ai-harness search \"<query>\" first, then grep only narrowed targets."
  fi
fi
if [[ -z "$nudge" ]]; then
  jq -n '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'
else
  jq -n --arg msg "$nudge" '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","additionalContext":$msg}}'
fi
`, safePolicy, Boolean(options.dryRun), changes);
  await writeManaged(root, ".claude/hooks/after-edit-check.sh", `#!/usr/bin/env bash
set -euo pipefail
if command -v npm >/dev/null 2>&1; then
  npm run typecheck --if-present >/dev/null 2>&1 || true
fi
if command -v python >/dev/null 2>&1; then
  python -m compileall -q src >/dev/null 2>&1 || true
fi
printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"post-edit checks complete"}}\n'
`, safePolicy, Boolean(options.dryRun), changes);

  await writeManaged(root, ".ai/rag/index.jsonl", "", safePolicy, Boolean(options.dryRun), changes);
  await writeManaged(root, ".ai/tasks/.gitkeep", "", safePolicy, Boolean(options.dryRun), changes);
  await writeManaged(root, ".ai/rag/manifest.json", JSON.stringify({ version: 1, chunks: 0 }, null, 2) + "\n", safePolicy, Boolean(options.dryRun), changes);

  if (!options.dryRun) {
    await fs.chmod(path.join(root, ".claude/hooks/block-dangerous-bash.sh"), 0o755).catch(() => undefined);
    await fs.chmod(path.join(root, ".claude/hooks/nudge-retrieve-context.sh"), 0o755).catch(() => undefined);
    await fs.chmod(path.join(root, ".claude/hooks/after-edit-check.sh"), 0o755).catch(() => undefined);
  }
  return changes;
}

export async function dryRunReport(changes: ScaffoldChange[]) {
  for (const change of changes) {
    console.log(`${change.action.toUpperCase()} ${change.path} (${change.reason})`);
    if (change.action === "update") {
      const patch = createTwoFilesPatch(change.path, change.path, change.before ?? "", change.after ?? "", "before", "after");
      console.log(patch.split("\n").slice(0, 20).join("\n"));
    }
  }
}
