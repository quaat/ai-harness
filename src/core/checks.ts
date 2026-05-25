import fs from "fs-extra";
import path from "node:path";
import { execaCommand } from "execa";
import { detectProject } from "./project-detector.js";

export type CheckResult = { name: "typecheck" | "test" | "build"; command: string; ok: boolean; output: string };

export async function runProjectChecks(cwd: string): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const project = await detectProject(cwd);
  const pkgPath = path.join(cwd, "package.json");
  if (await fs.pathExists(pkgPath)) {
    const pm = project.packageManager === "unknown" ? "npm" : project.packageManager;
    const cmds = [
      { name: "typecheck" as const, command: `${pm} run typecheck --if-present` },
      { name: "test" as const, command: `${pm} test --if-present` },
      { name: "build" as const, command: `${pm} run build --if-present` }
    ];
    for (const c of cmds) {
      try { const { stdout, stderr } = await execaCommand(c.command, { cwd, shell: true }); out.push({ ...c, ok: true, output: `${stdout}\n${stderr}`.trim() }); }
      catch (e: any) { out.push({ ...c, ok: false, output: `${e.stdout ?? ""}\n${e.stderr ?? e.message ?? ""}`.trim() }); }
    }
  }
  return out;
}

export function formatCheckResults(results: CheckResult[]): string {
  const ts = new Date().toISOString();
  return [`# Test/check results`, ``, `Generated: ${ts}`, ``, ...results.map((r) => `## ${r.name}\n\n- Command: \`${r.command}\`\n- Result: ${r.ok ? "passed" : "failed"}\n\n\`\`\`\n${r.output || "(no output)"}\n\`\`\``), ""].join("\n");
}
