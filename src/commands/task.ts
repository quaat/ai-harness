import fs from "fs-extra";
import path from "node:path";
import { Command } from "commander";
import { searchIndex } from "../core/rag.js";
import { runProjectChecks, formatCheckResults } from "../core/checks.js";
import { createPullRequest } from "../core/pr.js";
import { artifactPaths, createTaskFiles, readTask, writeTask } from "../core/task-store.js";
import { validateTaskId, type TaskManifest } from "../core/task-schema.js";
import { suggestNext } from "../core/task-state.js";
import { branchExists, createBranch, currentBranch, getWorktreeChangedFiles, hasCleanWorkingTree, isGitRepo, commitAll } from "../core/git.js";
import { renderClaudePrompt, renderCodexReviewPrompt } from "../core/prompt-renderer.js";
import { formatPath, printDocsHint, printInfo, printNextSteps, printSuccess } from "../core/ux.js";

const secretRegex = /(^|\/)(\.env(\..+)?|.*\.pem|.*\.key|id_rsa|id_ed25519|credentials\.json|secrets\.(yml|yaml|json|env))$/i;

export function taskCommand() {
  const t = new Command("task").description("Manage task workspaces and Claude/Codex handoff artifacts.");
  t.command("create").description("Create a task workspace and branch").argument("<taskId>").requiredOption("--prompt <prompt>").option("--no-branch", "Use current branch instead of creating ai/<task-id>").action(createTask);
  t.command("status").description("Show task status, artifacts, checks, and next step").argument("<taskId>").option("--json").action(statusTask);
  t.command("context").description("Generate bounded RAG context for a task").argument("<taskId>").option("--query <query>").action(contextTask);
  t.command("claude").description("Generate a copy-ready Claude implementation prompt").argument("<taskId>").action(claudeTask);
  t.command("codex-review").description("Generate a copy-ready Codex review prompt").argument("<taskId>").action(codexReviewTask);
  t.command("hardening").description("Generate Claude hardening instructions from Codex review notes").argument("<taskId>").action(hardeningTask);
  t.command("commit").description("Run checks and commit task changes").argument("<taskId>").option("--phase <phase>", "implementation|hardening", "implementation").option("--no-checks").action(commitTask);
  t.command("pr").description("Generate PR body and optionally open a PR with gh").argument("<taskId>").option("--draft").option("--skip-review").action(prTask);
  return t;
}

async function createTask(taskId: string, opts: { prompt: string; branch?: boolean }) {
  validateTaskId(taskId);
  const cwd = process.cwd();
  if (!(await isGitRepo(cwd))) throw new Error("Current directory is not a Git repository.");
  const clean = await hasCleanWorkingTree(cwd);
  if (!clean && opts.branch !== false) throw new Error("Working tree is dirty. Commit/stash first or use --no-branch.");
  const cur = await currentBranch(cwd);
  const baseBranch = ["main", "master"].includes(cur) ? cur : "main";
  const branch = opts.branch === false ? cur : `ai/${taskId}`;
  if (opts.branch !== false) {
    if (await branchExists(branch, cwd)) throw new Error(`Branch '${branch}' already exists.`);
    await createBranch(branch, cwd);
  }
  const now = new Date().toISOString();
  const manifest: TaskManifest = { id: taskId, title: opts.prompt.split("\n")[0], branch, baseBranch, status: "created", createdAt: now, updatedAt: now, artifacts: artifactPaths(taskId), checks: { typecheck: "pending", test: "pending", build: "pending" }, commits: { implementation: null, hardening: null }, pullRequest: { number: null, url: null } };
  await createTaskFiles(cwd, manifest, opts.prompt);
  printSuccess(`Created task \`${taskId}\``);
  printInfo(`\nBranch:\n  ${branch}\n\nTask files:\n  .ai/tasks/${taskId}/task.yaml\n  ${formatPath(manifest.artifacts.prompt)}`);
  printNextSteps([
    `1. Build a bounded context packet:\n     ai-harness task context ${taskId}`,
    `2. Generate the Claude prompt:\n     ai-harness task claude ${taskId}`
  ]);
  printDocsHint("full-claude--codex-workflow");
}

async function statusTask(taskId: string, opts: { json?: boolean }) {
  const t = await readTask(process.cwd(), taskId);
  const artifacts = await Promise.all(Object.entries(t.artifacts).map(async ([k, v]) => [k, await fs.pathExists(path.join(process.cwd(), v)), v]));
  const status = { id: t.id, status: t.status, branch: t.branch, baseBranch: t.baseBranch, artifacts: Object.fromEntries(artifacts.map(([k, ok]) => [k, ok])), checks: t.checks, commits: t.commits, pr: t.pullRequest, next: suggestNext(t.status, taskId) };
  if (opts.json) return console.log(JSON.stringify(status, null, 2));
  console.log(`Task: ${t.id}`);
  console.log(`Status: ${t.status}`);
  console.log(`Branch: ${t.branch}`);
  console.log(`Base: ${t.baseBranch}`);
  console.log("\nArtifacts:");
  for (const [key, ok, p] of artifacts) console.log(`  ${ok ? "✓" : "-"} ${path.basename(String(p))} (${key})`);
  console.log("\nChecks:");
  for (const [name, value] of Object.entries(t.checks)) console.log(`  ${name}: ${value}`);
  console.log("\nCommits:");
  console.log(`  implementation: ${t.commits.implementation ?? "-"}`);
  console.log(`  hardening: ${t.commits.hardening ?? "-"}`);
  printNextSteps([`ai-harness task ${status.next} ${taskId}`]);
}

async function contextTask(taskId: string, opts: { query?: string }) { const cwd = process.cwd(); const t = await readTask(cwd, taskId); const idx = path.join(cwd, ".ai/rag/index.jsonl"); if (!(await fs.pathExists(idx))) throw new Error("Missing .ai/rag/index.jsonl. Run `ai-harness index` first."); const prompt = await fs.readFile(path.join(cwd, t.artifacts.prompt), "utf8"); const query = opts.query ?? `${t.id} ${prompt.split("\n")[2] ?? ""}`.trim(); const rows = (await searchIndex(cwd, query)).slice(0, 5); const relevant = rows.map((r, i) => `### ${i + 1}. ${r.path}:${r.startLine}-${r.endLine}\n\nReason relevant:\n- Matches task keywords\n\nSnippet:\n\n\`\`\`\n${r.text.slice(0, 500)}\n\`\`\``).join("\n\n"); const files = rows.map((r) => `- \`${r.path}:${r.startLine}-${r.endLine}\``).join("\n"); const content = `# Context for ${taskId}\n\n## Queries used\n\n- ${query}\n\n## Relevant chunks\n\n${relevant || "No matching chunks."}\n\n## Files and line ranges to inspect\n\n${files || "- TBD"}\n\n## What not to read unless necessary\n\n- Broad directories\n- Generated files\n- Dependency directories\n\n## Open questions\n\n- TBD\n`; await fs.writeFile(path.join(cwd, t.artifacts.context), content); t.status = "context-ready"; await writeTask(cwd, t); printSuccess(`Wrote bounded context for \`${taskId}\``); printInfo(`\nQuery:\n  ${query}\n\nResults:\n  ${rows.length} chunks written to ${formatPath(t.artifacts.context)}`); printNextSteps([`ai-harness task claude ${taskId}`]); }

async function claudeTask(taskId: string) { const cwd = process.cwd(); const t = await readTask(cwd, taskId); await fs.writeFile(path.join(cwd, t.artifacts.claudeImplement), renderClaudePrompt(taskId)); t.status = "implementation-prompt-ready"; await writeTask(cwd, t); printSuccess("Claude implementation prompt ready"); printInfo(`\nPrompt:\n  ${formatPath(t.artifacts.claudeImplement)}\n\nOpen Claude Code and paste the contents of that file.\n\nClaude should write:\n  ${formatPath(t.artifacts.implementation)}\n  ${formatPath(t.artifacts.tests)}`); printNextSteps([`ai-harness task commit ${taskId}`]); }
async function codexReviewTask(taskId: string) { const cwd = process.cwd(); const t = await readTask(cwd, taskId); await fs.writeFile(path.join(cwd, t.artifacts.codexReviewPrompt), renderCodexReviewPrompt(taskId, t.baseBranch)); t.status = "codex-review-ready"; await writeTask(cwd, t); printSuccess("Codex review prompt ready"); printInfo(`\nPrompt:\n  ${formatPath(t.artifacts.codexReviewPrompt)}\n\nPaste this into Codex.\n\nCodex should write:\n  ${formatPath(t.artifacts.codexReview)}`); printNextSteps([`ai-harness task hardening ${taskId}`]); }

async function hardeningTask(taskId: string) { const cwd = process.cwd(); const t = await readTask(cwd, taskId); const reviewPath = path.join(cwd, t.artifacts.codexReview); if (!(await fs.pathExists(reviewPath))) throw new Error(`Missing ${t.artifacts.codexReview}`); const review = await fs.readFile(reviewPath, "utf8"); const section = (h: string) => (review.match(new RegExp(`## ${h}[\\s\\S]*?(?=\\n## |$)`, "i"))?.[0] ?? `## ${h}\n\n- None provided.`); const out = `# Claude hardening instructions for ${taskId}\n\nRead:\n- \`${t.artifacts.codexReview}\`\n- \`${t.artifacts.claudeFixInstructions}\`\n\nApply only required fixes unless optional hardening is explicitly low-risk and in scope.\n\n${section("Instructions for Claude")}\n\n## Required fixes\n\n${section("Required fixes").replace(/^## Required fixes\s*/i, "")}\n\n## Test gaps to address\n\n${section("Test gaps").replace(/^## Test gaps\s*/i, "")}\n\n## Security concerns to address\n\n${section("Security review").replace(/^## Security review\s*/i, "")}\n\n## Optional hardening\n\n${section("Suggested hardening").replace(/^## Suggested hardening\s*/i, "")}\n\n## Rules\n\n- Do not expand scope.\n- Update or add tests for each required fix.\n- Write changes made to \`${t.artifacts.hardening}\`.\n- Run required checks.\n- Do not modify unrelated files.\n`; await fs.writeFile(path.join(cwd, t.artifacts.claudeFixInstructions), out); t.status = "hardening-prompt-ready"; await writeTask(cwd, t); printSuccess("Claude hardening instructions ready"); printInfo(`\nInstructions:\n  ${formatPath(t.artifacts.claudeFixInstructions)}\n\nPaste this into Claude Code.\n\nClaude should write:\n  ${formatPath(t.artifacts.hardening)}`); printNextSteps([`ai-harness task commit ${taskId} --phase hardening`]); }

async function commitTask(taskId: string, opts: { phase: string; checks?: boolean }) {
  if (!["implementation", "hardening"].includes(opts.phase)) throw new Error("Invalid --phase value. Use 'implementation' or 'hardening'.");
  const phase = opts.phase as "implementation" | "hardening";
  const cwd = process.cwd(); const t = await readTask(cwd, taskId);
  if (await currentBranch(cwd) !== t.branch) throw new Error(`Current branch must be ${t.branch}`);
  const files = await getWorktreeChangedFiles(cwd);
  if (!files.length) throw new Error("No changes to commit.");
  if (files.some((f) => secretRegex.test(f))) throw new Error("Refusing to commit possible secret files from working tree changes.");
  let results: any[] = [];
  if (opts.checks !== false) {
    results = await runProjectChecks(cwd);
    await fs.writeFile(path.join(cwd, t.artifacts.tests), formatCheckResults(results));
    if (results.some((r) => !r.ok)) throw new Error(`Checks failed. Details written to:\n  ${t.artifacts.tests}\n\nFix the failures, then rerun:\n  ai-harness task commit ${taskId}`);
    if (!results.length) t.checks = { typecheck: "skipped", test: "skipped", build: "skipped" };
    else t.checks = { typecheck: results.find((r) => r.name === "typecheck")?.ok ? "passed" : "failed", test: results.find((r) => r.name === "test")?.ok ? "passed" : "failed", build: results.find((r) => r.name === "build")?.ok ? "passed" : "failed" };
  }
  const msg = phase === "hardening" ? `fix(${taskId}): address Codex review feedback\n\nTask: ${taskId}\nReview: ${t.artifacts.codexReview}\nHardening: ${t.artifacts.hardening}\nTests: ${t.artifacts.tests}` : `feat(${taskId}): implement task\n\nTask: ${taskId}\nPrompt: ${t.artifacts.prompt}\nImplementation: ${t.artifacts.implementation}\nTests: ${t.artifacts.tests}`;
  const implementationSha = await commitAll(msg, cwd);
  t.commits[phase] = implementationSha;
  t.status = phase === "hardening" ? "hardened" : "committed";
  await writeTask(cwd, t);
  const metaMsg = phase === "hardening" ? `chore(${taskId}): record hardening task metadata` : `chore(${taskId}): record implementation task metadata`;
  await commitAll(metaMsg, cwd);
  printSuccess(`Committed ${phase} for \`${taskId}\``);
  printInfo(`\nChange commit:\n  ${implementationSha}\n\nMetadata:\n  task.yaml updated and committed separately.\n\nChecks:\n  typecheck: ${t.checks.typecheck}\n  test: ${t.checks.test}\n  build: ${t.checks.build}`);
  printNextSteps([phase === "hardening" ? `ai-harness task pr ${taskId} --draft` : `ai-harness task codex-review ${taskId}`]);
}

async function prTask(taskId: string, opts: { draft?: boolean; skipReview?: boolean }) {
  const cwd = process.cwd(); const t = await readTask(cwd, taskId);
  if (await currentBranch(cwd) !== t.branch) throw new Error(`Current branch must be ${t.branch}`);
  if (["main", "master"].includes(t.branch)) throw new Error("Refusing to open PR from main/master");
  if (!(await hasCleanWorkingTree(cwd))) throw new Error("Working tree must be clean.");
  if (!t.commits.implementation) throw new Error("Implementation commit is required.");
  if (!opts.skipReview && !(await fs.pathExists(path.join(cwd, t.artifacts.codexReview)))) throw new Error("codex-review.md is required unless --skip-review is used.");
  const body = `## Summary\n\nTask ${taskId} implementation and hardening updates.\n\n## Task\n\nSee \`${t.artifacts.prompt}\`.\n\n## Context\n\nSee \`${t.artifacts.context}\`.\n\n## Implementation notes\n\nSee \`${t.artifacts.implementation}\`.\n\n## Tests\n\nSee \`${t.artifacts.tests}\`.\n\n## Codex review\n\nSee \`${t.artifacts.codexReview}\`.\n\n## Hardening\n\nSee \`${t.artifacts.hardening}\`.\n\n## Risks\n\n- TBD\n\n## Rollback\n\nRevert this PR.\n`;
  await fs.writeFile(path.join(cwd, t.artifacts.pr), body);
  const afterArtifactsWriteClean = await hasCleanWorkingTree(cwd);
  if (!afterArtifactsWriteClean) {
    throw new Error(`PR body generated:\n  ${t.artifacts.pr}\n\nThis changed the working tree.\n\nCommit the PR artifact first:\n  git add ${t.artifacts.pr}\n  git commit -m "chore(${taskId}): add PR body"\n\nThen rerun:\n  ai-harness task pr ${taskId} --draft`);
  }
  const title = `${taskId}: implement task workflow`;
  const result = await createPullRequest({ cwd, baseBranch: t.baseBranch, headBranch: t.branch, title, bodyFile: t.artifacts.pr, draft: Boolean(opts.draft) });
  if (result.url) return printSuccess(`Opened ${opts.draft ? "draft " : ""}PR:\n  ${result.url}`);
  printInfo("Could not create PR with GitHub CLI.\n\nReason:\n  gh is not installed or not authenticated\n\nRun:\n  gh auth login\n\nOr create the PR manually with:");
  printInfo(`  ${result.command}`);
}
