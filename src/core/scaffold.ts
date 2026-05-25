import fs from "fs-extra";
import path from "node:path";
import YAML from "yaml";
import { createTwoFilesPatch } from "diff";
import type { DetectedProject, HarnessOptions, ScaffoldChange, WritePolicy } from "./types.js";

const START = "<!-- ai-harness:start -->";
const END = "<!-- ai-harness:end -->";

const REQUIRED_DIRS = [
  ".ai/plans", ".ai/reviews", ".ai/handoffs", ".ai/decisions", ".ai/retrieval-notes", ".ai/rag", ".ai/prompts",
  ".claude/skills/implement-plan", ".claude/skills/retrieve-context", ".claude/skills/verify-change", ".claude/skills/prepare-codex-review",
  ".claude/hooks", "docs/architecture", "docs/adr", "docs/knowledge", "docs/runbooks", "scripts/rag"
];

function managedDoc(title: string, body: string) {
  return `# ${title}\n\n${START}\n${body}\n${END}\n`;
}

function mergeManaged(existing: string, nextBlockDoc: string): string {
  const m = nextBlockDoc.match(new RegExp(`${START}[\\s\\S]*${END}`));
  if (!m) return existing;
  if (existing.includes(START) && existing.includes(END)) {
    return existing.replace(new RegExp(`${START}[\\s\\S]*${END}`), m[0]);
  }
  return `${existing.trimEnd()}\n\n${m[0]}\n`;
}

async function writeManaged(root: string, rel: string, content: string, policy: WritePolicy, dryRun: boolean, changes: ScaffoldChange[]) {
  const target = path.join(root, rel);
  const exists = await fs.pathExists(target);
  if (!exists) {
    changes.push({ path: rel, action: "create", reason: "new file" });
    if (!dryRun) await fs.writeFile(target, content);
    return;
  }
  let next = content;
  if (policy === "skip" || policy === "create") {
    changes.push({ path: rel, action: "skip", reason: `exists (${policy})` });
    return;
  }
  if (policy === "merge") {
    const current = await fs.readFile(target, "utf8");
    next = mergeManaged(current, content);
    if (next === current) {
      changes.push({ path: rel, action: "skip", reason: "no changes after merge" });
      return;
    }
  }
  if (!dryRun) await fs.writeFile(target, next);
  changes.push({ path: rel, action: "update", reason: policy });
}

export async function scaffoldHarness(root: string, detected: DetectedProject, options: HarnessOptions): Promise<ScaffoldChange[]> {
  const changes: ScaffoldChange[] = [];
  for (const dir of REQUIRED_DIRS) await fs.ensureDir(path.join(root, dir));
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
  await writeManaged(root, "AGENTS.md", managedDoc("AGENTS", "Shared operating manual for Codex and Claude.\n\n## Workflow\n1. Plan in .ai/plans\n2. Implement in .ai/handoffs\n3. Review in .ai/reviews"), docPolicy, Boolean(options.dryRun), changes);
  await writeManaged(root, "CLAUDE.md", managedDoc("Claude Code instructions", "@AGENTS.md\n\nUse project skills in .claude/skills and run validations before handoff."), docPolicy, Boolean(options.dryRun), changes);

  const skills: Record<string, string> = {
    "implement-plan": "---\nname: implement-plan\ndescription: Execute approved plan safely\n---\nRead plan, implement smallest safe change, update handoff notes.",
    "retrieve-context": "---\nname: retrieve-context\ndescription: Fetch targeted context from local RAG\n---\nRun ai-harness search first, then read only top matching files.",
    "verify-change": "---\nname: verify-change\ndescription: Validate quality gates before review\n---\nRun lint/typecheck/test/build and summarize failures with fixes.",
    "prepare-codex-review": "---\nname: prepare-codex-review\ndescription: Package implementation for Codex review\n---\nSummarize changes, tests, risks, and open questions in .ai/reviews."
  };
  for (const [name, text] of Object.entries(skills)) {
    await writeManaged(root, `.claude/skills/${name}/SKILL.md`, `${text}\n`, safePolicy, Boolean(options.dryRun), changes);
  }

  await writeManaged(root, ".claude/settings.json", JSON.stringify({ hooks: { preCommand: [".claude/hooks/block-dangerous-bash.sh"], postEdit: [".claude/hooks/after-edit-check.sh"] } }, null, 2) + "\n", safePolicy, Boolean(options.dryRun), changes);
  await writeManaged(root, ".claude/hooks/block-dangerous-bash.sh", "#!/usr/bin/env bash\nset -euo pipefail\ncmd=\"${1:-}\"\n[[ \"$cmd\" =~ (rm -rf /|:(){:|:&};:) ]] && { echo 'blocked dangerous command'; exit 1; }\n", safePolicy, Boolean(options.dryRun), changes);
  await writeManaged(root, ".claude/hooks/after-edit-check.sh", "#!/usr/bin/env bash\nset -euo pipefail\necho 'post-edit check: ok'\n", safePolicy, Boolean(options.dryRun), changes);

  await writeManaged(root, ".ai/rag/index.jsonl", "", safePolicy, Boolean(options.dryRun), changes);
  await writeManaged(root, ".ai/rag/manifest.json", JSON.stringify({ version: 1, chunks: 0 }, null, 2) + "\n", safePolicy, Boolean(options.dryRun), changes);

  if (!options.dryRun) {
    await fs.chmod(path.join(root, ".claude/hooks/block-dangerous-bash.sh"), 0o755).catch(() => undefined);
    await fs.chmod(path.join(root, ".claude/hooks/after-edit-check.sh"), 0o755).catch(() => undefined);
  }
  return changes;
}

export async function dryRunReport(root: string, changes: ScaffoldChange[]) {
  for (const change of changes) {
    console.log(`${change.action.toUpperCase()} ${change.path} (${change.reason})`);
    if (change.action === "update") {
      const current = await fs.readFile(path.join(root, change.path), "utf8").catch(() => "");
      const patch = createTwoFilesPatch(change.path, change.path, current, current, "before", "after");
      console.log(patch.split("\n").slice(0, 8).join("\n"));
    }
  }
}
