import { detectProject } from "../core/project-detector.js";
import { dryRunReport, scaffoldHarness } from "../core/scaffold.js";

export async function retrofitCommand(opts: { dryRun?: boolean; merge?: boolean; force?: boolean }) {
  const detected = await detectProject(process.cwd());
  const changes = await scaffoldHarness(process.cwd(), detected, { agents: ["codex", "claude"], rag: "local-jsonl", merge: Boolean(opts.merge), force: Boolean(opts.force), dryRun: Boolean(opts.dryRun) });
  if (opts.dryRun) {
    await dryRunReport(process.cwd(), changes);
    return;
  }
  console.log("Retrofitted repository with ai-harness files.");
}
