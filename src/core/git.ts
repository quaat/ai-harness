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
export async function getWorktreeChangedFiles(cwd: string): Promise<string[]> {
  const { stdout } = await git(["status", "--porcelain"], cwd);
  const files = new Set<string>();
  for (const rawLine of stdout.split("\n").filter(Boolean)) {
    const line = rawLine.trimEnd();
    const payload = line.slice(3);
    if (!payload) continue;
    if (payload.includes(" -> ")) {
      const [oldPath, newPath] = payload.split(" -> ");
      if (oldPath) files.add(oldPath);
      if (newPath) files.add(newPath);
      continue;
    }
    files.add(payload);
  }
  return [...files];
}
export async function getDiff(base: string, cwd: string): Promise<string> { const { stdout } = await git(["diff", `${base}...HEAD`], cwd); return stdout; }
export async function commitAll(message: string, cwd: string): Promise<string> {
  await git(["add", "-A"], cwd);
  await git(["commit", "-m", message], cwd);
  const { stdout } = await git(["rev-parse", "HEAD"], cwd);
  return stdout.trim();
}
export async function amendAll(cwd: string): Promise<string> {
  await git(["add", "-A"], cwd);
  await git(["commit", "--amend", "--no-edit"], cwd);
  const { stdout } = await git(["rev-parse", "HEAD"], cwd);
  return stdout.trim();
}
