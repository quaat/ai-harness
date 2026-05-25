import { detectProject } from "../core/project-detector.js";
import { scaffoldHarness } from "../core/scaffold.js";

export async function retrofitCommand(dryRun = false) {
  const detected = await detectProject(process.cwd());
  if (dryRun) {
    console.log("Would create: AGENTS.md, CLAUDE.md, .ai/*, .claude/*, scripts/rag/*");
    console.log(`Detected stack: ${detected.stack}, package manager: ${detected.packageManager}`);
    return;
  }
  await scaffoldHarness(process.cwd(), detected, { agents: ["codex", "claude"], rag: "local-jsonl", merge: true });
  console.log("Retrofitted repository with ai-harness files.");
}
