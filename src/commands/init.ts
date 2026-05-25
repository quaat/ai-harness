import { detectProject } from "../core/project-detector.js";
import { scaffoldHarness } from "../core/scaffold.js";

export async function initCommand() {
  const detected = await detectProject(process.cwd());
  await scaffoldHarness(process.cwd(), detected, { agents: ["codex", "claude"], rag: "local-jsonl", merge: false, force: false });
  console.log("Initialized ai-harness scaffold.");
}
