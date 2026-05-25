import fs from "fs-extra";

const required = ["AGENTS.md", "CLAUDE.md", ".ai/plans", ".ai/handoffs", ".ai/reviews", ".ai/rag/index.jsonl"];

export async function doctorCommand() {
  const missing: string[] = [];
  for (const item of required) {
    if (!(await fs.pathExists(item))) missing.push(item);
  }
  const claude = (await fs.pathExists("CLAUDE.md")) ? await fs.readFile("CLAUDE.md", "utf8") : "";
  if (!claude.includes("@AGENTS.md")) missing.push("CLAUDE.md missing @AGENTS.md import");

  if (missing.length) {
    console.log("Doctor found issues:");
    missing.forEach((m) => console.log(`- ${m}`));
    process.exitCode = 1;
    return;
  }
  console.log("Doctor: setup looks healthy.");
}
