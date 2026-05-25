import fs from "fs-extra";
import path from "node:path";
import YAML from "yaml";
import type { DetectedProject, HarnessOptions } from "./types.js";

const REQUIRED_DIRS = [
  ".ai/plans",
  ".ai/reviews",
  ".ai/handoffs",
  ".ai/decisions",
  ".ai/retrieval-notes",
  ".ai/rag",
  ".ai/prompts",
  ".claude/skills/implement-plan",
  ".claude/skills/retrieve-context",
  ".claude/skills/verify-change",
  ".claude/skills/prepare-codex-review",
  ".claude/hooks",
  "docs/architecture",
  "docs/adr",
  "docs/knowledge",
  "docs/runbooks",
  "scripts/rag"
];

export async function scaffoldHarness(root: string, detected: DetectedProject, options: HarnessOptions) {
  for (const dir of REQUIRED_DIRS) await fs.ensureDir(path.join(root, dir));

  const config = {
    version: 1,
    project: { name: "auto", stack: detected.stack, packageManager: detected.packageManager },
    agents: {
      codex: { enabled: options.agents.includes("codex"), role: "planning-review", instructionsFile: "AGENTS.md" },
      claude: { enabled: options.agents.includes("claude"), role: "implementation-testing", instructionsFile: "CLAUDE.md" }
    },
    commands: {
      install: detected.commands.install ?? "auto",
      lint: detected.commands.lint ?? "auto",
      typecheck: detected.commands.typecheck ?? "auto",
      test: detected.commands.test ?? "auto",
      build: detected.commands.build ?? "auto"
    }
  };

  await fs.writeFile(path.join(root, "ai-harness.config.yaml"), YAML.stringify(config));
  await fs.writeFile(path.join(root, "AGENTS.md"), `# AGENTS\n\nShared operating manual for Codex and Claude.\n\n## Retrieval first\nRun \`ai-harness search \"<query>\"\` before broad reads.\n\n## Workflow\n1. Plan: write .ai/plans/<task-id>.md\n2. Implement: write .ai/handoffs/<task-id>.md\n3. Review: write .ai/reviews/<task-id>.md\n`);
  await fs.writeFile(path.join(root, "CLAUDE.md"), `@AGENTS.md\n\n# Claude Code instructions\n\nYou are the implementation and verification agent.\nUse .claude/skills.\n`);

  await fs.writeFile(path.join(root, ".ai/rag/index.jsonl"), "");
  await fs.writeJson(path.join(root, ".ai/rag/manifest.json"), { version: 1, chunks: 0 }, { spaces: 2 });

  await fs.writeFile(path.join(root, "scripts/rag/index.js"), `#!/usr/bin/env node\nconsole.log('Use ai-harness index');\n`);
  await fs.writeFile(path.join(root, "scripts/rag/search.js"), `#!/usr/bin/env node\nconsole.log('Use ai-harness search');\n`);
}
