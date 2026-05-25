import fs from "fs-extra";
import { execa } from "execa";
import YAML from "yaml";

const requiredFiles = ["AGENTS.md", "CLAUDE.md", "ai-harness.config.yaml", ".claude/settings.json"];
const skills = ["implement-plan", "retrieve-context", "verify-change", "prepare-codex-review"];
const hooks = [".claude/hooks/block-dangerous-bash.sh", ".claude/hooks/after-edit-check.sh"];
const ragFiles = [".ai/rag/index.jsonl", ".ai/rag/manifest.json"];

export async function doctorCommand(opts: { json?: boolean } = {}) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const required = await Promise.all(requiredFiles.map(async (f) => [f, await fs.pathExists(f)] as const));
  const skillChecks = await Promise.all(skills.map(async (s) => [s, await fs.pathExists(`.claude/skills/${s}/SKILL.md`)] as const));
  const hookChecks = await Promise.all(hooks.map(async (h) => [h, await fs.pathExists(h)] as const));
  const ragChecks = await Promise.all(ragFiles.map(async (f) => [f, await fs.pathExists(f)] as const));

  for (const [item, ok] of required) if (!ok) errors.push(`missing: ${item}`);
  for (const [s, ok] of skillChecks) if (!ok) errors.push(`missing skill: ${s}`);
  for (const [h, ok] of hookChecks) if (!ok) warnings.push(`missing optional hook: ${h}`);
  for (const [r, ok] of ragChecks) if (!ok) errors.push(`missing: ${r}`);

  const claude = (await fs.pathExists("CLAUDE.md")) ? await fs.readFile("CLAUDE.md", "utf8") : "";
  if (claude && !claude.includes("@AGENTS.md")) errors.push("CLAUDE.md missing @AGENTS.md import");

  let jqAvailable = true;
  try { await execa("jq", ["--version"]); } catch { jqAvailable = false; warnings.push("jq is not available in PATH; Claude hooks may fail"); }

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

  const result = { ok: errors.length === 0, errors, warnings, checks: { required: Object.fromEntries(required), skills: Object.fromEntries(skillChecks), hooks: Object.fromEntries(hookChecks), rag: Object.fromEntries(ragChecks), jq: jqAvailable } };
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("ai-harness doctor\n");
    console.log("Required files:");
    for (const [f, ok] of required) console.log(`  ${ok ? "✓" : "✗"} ${f}`);
    console.log("\nSkills:");
    for (const [s, ok] of skillChecks) console.log(`  ${ok ? "✓" : "✗"} ${s}`);
    console.log("\nHooks:");
    for (const [h, ok] of hookChecks) console.log(`  ${ok ? "✓" : "!"} ${h.split("/").at(-1)}`);
    if (!jqAvailable) console.log("  ! jq is not available; Claude hooks may fail");
    console.log("\nRAG:");
    for (const [f, ok] of ragChecks) console.log(`  ${ok ? "✓" : "✗"} ${f}`);
    const label = errors.length ? "Not ready" : warnings.length ? "Ready with warnings" : "Ready";
    console.log(`\nResult:\n  ${label}`);
  }
  if (!result.ok) process.exitCode = 1;
}
