import fs from "fs-extra";
import path from "node:path";
import type { DetectedProject, PackageManager } from "./types.js";

function detectPackageManager(root: string): PackageManager {
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(root, "bun.lockb"))) return "bun";
  if (fs.existsSync(path.join(root, "package-lock.json"))) return "npm";
  return "unknown";
}

export async function detectProject(root: string): Promise<DetectedProject> {
  const hasPackageJson = await fs.pathExists(path.join(root, "package.json"));
  const hasPyproject = await fs.pathExists(path.join(root, "pyproject.toml"));
  const hasGoMod = await fs.pathExists(path.join(root, "go.mod"));
  const hasCargo = await fs.pathExists(path.join(root, "Cargo.toml"));

  let stack: DetectedProject["stack"] = "unknown";
  if (hasPackageJson) stack = "node";
  else if (hasPyproject) stack = "python";
  else if (hasGoMod) stack = "go";
  else if (hasCargo) stack = "rust";

  const packageManager = detectPackageManager(root);
  const commands: DetectedProject["commands"] = {};

  if (stack === "node" && hasPackageJson) {
    const pkg = await fs.readJson(path.join(root, "package.json"));
    const scripts = pkg.scripts ?? {};
    if (packageManager !== "unknown") commands.install = `${packageManager} install`;
    if (scripts.lint) commands.lint = `${packageManager === "unknown" ? "npm" : packageManager} run lint`;
    if (scripts.typecheck) commands.typecheck = `${packageManager === "unknown" ? "npm" : packageManager} run typecheck`;
    if (scripts.test) commands.test = `${packageManager === "unknown" ? "npm" : packageManager} test`;
    if (scripts.build) commands.build = `${packageManager === "unknown" ? "npm" : packageManager} run build`;
  }

  return { stack, packageManager, commands };
}
