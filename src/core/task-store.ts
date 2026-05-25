import fs from "fs-extra";
import path from "node:path";
import YAML from "yaml";
import { taskManifestSchema, type TaskManifest, type TaskStatus } from "./task-schema.js";

export const TASK_ROOT = ".ai/tasks";
export function taskDir(cwd: string, taskId: string) { return path.join(cwd, TASK_ROOT, taskId); }
export function taskPath(cwd: string, taskId: string) { return path.join(taskDir(cwd, taskId), "task.yaml"); }

export function artifactPaths(taskId: string) {
  const b = `.ai/tasks/${taskId}`;
  return { prompt: `${b}/prompt.md`, context: `${b}/context.md`, claudeImplement: `${b}/claude-implement.md`, implementation: `${b}/implementation.md`, tests: `${b}/tests.md`, codexReviewPrompt: `${b}/codex-review-prompt.md`, codexReview: `${b}/codex-review.md`, claudeFixInstructions: `${b}/claude-fix-instructions.md`, hardening: `${b}/hardening.md`, pr: `${b}/pr.md` };
}

export async function createTaskFiles(cwd: string, manifest: TaskManifest, prompt: string) {
  const dir = taskDir(cwd, manifest.id);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, "prompt.md"), `# Task: ${manifest.id}\n\n${prompt}\n\n## Scope\n\nTBD\n\n## Non-goals\n\nTBD\n\n## Acceptance criteria\n\nTBD\n`);
  for (const name of ["context.md", "claude-implement.md", "implementation.md", "tests.md", "codex-review-prompt.md", "codex-review.md", "claude-fix-instructions.md", "hardening.md", "pr.md"]) {
    await fs.ensureFile(path.join(dir, name));
  }
  await writeTask(cwd, manifest);
}

export async function readTask(cwd: string, taskId: string): Promise<TaskManifest> {
  const p = taskPath(cwd, taskId);
  if (!(await fs.pathExists(p))) throw new Error(`Task '${taskId}' not found at ${p}`);
  const parsed = YAML.parse(await fs.readFile(p, "utf8"));
  const res = taskManifestSchema.safeParse(parsed);
  if (!res.success) throw new Error(`Invalid task manifest for '${taskId}': ${res.error.issues.map((i) => i.message).join("; ")}`);
  return res.data;
}

export async function writeTask(cwd: string, manifest: TaskManifest) {
  manifest.updatedAt = new Date().toISOString();
  await fs.writeFile(taskPath(cwd, manifest.id), YAML.stringify(manifest));
}

export async function updateTaskStatus(cwd: string, taskId: string, status: TaskStatus) { const t = await readTask(cwd, taskId); t.status = status; await writeTask(cwd, t); }
export async function artifactExists(cwd: string, rel: string) { return fs.pathExists(path.join(cwd, rel)); }
