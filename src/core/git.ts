import { execa } from "execa";

async function git(args: string[], cwd: string) {
  return execa("git", args, { cwd });
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try { await git(["rev-parse", "--is-inside-work-tree"], cwd); return true; } catch { return false; }
}
export async function currentBranch(cwd: string): Promise<string> {
  const { stdout } = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd); return stdout.trim();
}
export async function hasCleanWorkingTree(cwd: string): Promise<boolean> {
  const { stdout } = await git(["status", "--porcelain"], cwd); return stdout.trim().length === 0;
}
export async function createBranch(branch: string, cwd: string): Promise<void> { await git(["checkout", "-b", branch], cwd); }
export async function branchExists(branch: string, cwd: string): Promise<boolean> { try { await git(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], cwd); return true; } catch { return false; } }
export async function getChangedFiles(cwd: string): Promise<string[]> { const { stdout } = await git(["diff", "--name-only"], cwd); return stdout.split("\n").map((x) => x.trim()).filter(Boolean); }
export async function getDiff(base: string, cwd: string): Promise<string> { const { stdout } = await git(["diff", `${base}...HEAD`], cwd); return stdout; }
export async function commitAll(message: string, cwd: string): Promise<string> {
  await git(["add", "-A"], cwd);
  await git(["commit", "-m", message], cwd);
  const { stdout } = await git(["rev-parse", "HEAD"], cwd);
  return stdout.trim();
}
export async function branchExistsAny(name: string, cwd: string): Promise<boolean> { return branchExists(name, cwd); }
