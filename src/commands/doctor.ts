import fs from "fs-extra";
import { execa } from "execa";
import YAML from "yaml";

const required = ["AGENTS.md", "CLAUDE.md", "ai-harness.config.yaml", ".ai/plans", ".ai/handoffs", ".ai/reviews", ".ai/decisions", ".ai/retrieval-notes", ".ai/prompts", ".ai/rag/index.jsonl", ".ai/rag/manifest.json", ".claude/settings.json"];
const skills = ["implement-plan", "retrieve-context", "verify-change", "prepare-codex-review"];

export async function doctorCommand() {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const item of required) if (!(await fs.pathExists(item))) errors.push(`missing: ${item}`);
  for (const s of skills) if (!(await fs.pathExists(`.claude/skills/${s}/SKILL.md`))) errors.push(`missing skill: ${s}`);
  for (const h of [".claude/hooks/block-dangerous-bash.sh", ".claude/hooks/after-edit-check.sh"]) if (!(await fs.pathExists(h))) warnings.push(`missing optional hook: ${h}`);
  const claude = (await fs.pathExists("CLAUDE.md")) ? await fs.readFile("CLAUDE.md", "utf8") : "";
  if (!claude.includes("@AGENTS.md")) errors.push("CLAUDE.md missing @AGENTS.md import");
  try {
    await execa("jq", ["--version"]);
  } catch {
    warnings.push("jq is not available in PATH; hook JSON emission checks may fail");
  }

  if (await fs.pathExists("ai-harness.config.yaml")) {
    try {
      const cfg = YAML.parse(await fs.readFile("ai-harness.config.yaml", "utf8"));
      const includes: string[] = cfg?.rag?.include ?? [];
      if (includes.some((x) => x === "." || x === "**")) warnings.push("unsafe rag include pattern detected");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`invalid ai-harness.config.yaml: ${message}`);
    }
  }
  const result = { ok: errors.length === 0, errors, warnings };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
