import { execa } from "execa";

export async function hasGhCli(cwd: string): Promise<boolean> {
  try { await execa("gh", ["--version"], { cwd }); return true; } catch { return false; }
}

export async function createPullRequest(args: { cwd: string; baseBranch: string; headBranch: string; title: string; bodyFile: string; draft?: boolean }) {
  const command = `gh pr create --base ${args.baseBranch} --head ${args.headBranch} --title "${args.title}" --body-file ${args.bodyFile}${args.draft ? " --draft" : ""}`;
  if (!(await hasGhCli(args.cwd))) return { command };
  const ghArgs = ["pr", "create", "--base", args.baseBranch, "--head", args.headBranch, "--title", args.title, "--body-file", args.bodyFile, ...(args.draft ? ["--draft"] : [])];
  const { stdout } = await execa("gh", ghArgs, { cwd: args.cwd });
  const urlMatch = stdout.match(/https:\/\/\S+/);
  return { command, url: urlMatch?.[0] };
}
