import { detectProject } from "../core/project-detector.js";
import { dryRunReport, scaffoldHarness } from "../core/scaffold.js";

export async function retrofitCommand(opts: { dryRun?: boolean; merge?: boolean; force?: boolean }) {
  const detected = await detectProject(process.cwd());
  const changes = await scaffoldHarness(process.cwd(), detected, { agents: ["codex", "claude"], rag: "local-jsonl", merge: Boolean(opts.merge), force: Boolean(opts.force), dryRun: Boolean(opts.dryRun) });
  if (opts.dryRun) return dryRunReport(changes);

  const summary = changes.reduce((acc, c) => ({ ...acc, [c.action]: acc[c.action] + 1 }), { create: 0, update: 0, skip: 0 });
  console.log(`Retrofitted repository with ai-harness files. Created: ${summary.create}, Updated: ${summary.update}, Skipped: ${summary.skip}.`);
}
