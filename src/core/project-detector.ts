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
  else if (hasPyproject || await fs.pathExists(path.join(root, "requirements.txt"))) stack = "python";
  else if (hasGoMod || await fs.pathExists(path.join(root, "go.work"))) stack = "go";
  else if (hasCargo || await fs.pathExists(path.join(root, "Cargo.lock"))) stack = "rust";

  const packageManager = detectPackageManager(root);
  const commands: DetectedProject["commands"] = {};
  if (stack === "node" && hasPackageJson) {
    const pkg = await fs.readJson(path.join(root, "package.json"));
    const scripts = pkg.scripts ?? {};
    const pm = packageManager === "unknown" ? "npm" : packageManager;
    commands.install = `${pm} install`;
    if (scripts.lint) commands.lint = `${pm} run lint`;
    if (scripts.typecheck) commands.typecheck = `${pm} run typecheck`;
    if (scripts.test) commands.test = `${pm} test`;
    if (scripts.build) commands.build = `${pm} run build`;
  }
  if (stack === "python") Object.assign(commands, { install: "uv sync", lint: "ruff check .", typecheck: "mypy .", test: "pytest", build: "python -m build" });
  if (stack === "go") Object.assign(commands, { install: "go mod download", lint: "go vet ./...", test: "go test ./...", build: "go build ./..." });
  if (stack === "rust") Object.assign(commands, { install: "cargo fetch", lint: "cargo clippy -- -D warnings", typecheck: "cargo fmt --check", test: "cargo test", build: "cargo build" });

  return { stack, packageManager, commands };
}
