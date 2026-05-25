export type Stack = "node" | "python" | "go" | "rust" | "java" | "unknown";
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "unknown";
export type WritePolicy = "create" | "merge" | "skip" | "overwrite";

export type DetectedProject = {
  stack: Stack;
  packageManager: PackageManager;
  commands: Partial<Record<"install" | "lint" | "typecheck" | "test" | "build", string>>;
};

export type HarnessOptions = {
  agents: Array<"codex" | "claude">;
  rag: "local-jsonl";
  merge?: boolean;
  force?: boolean;
  dryRun?: boolean;
};

export type ScaffoldChange = {
  path: string;
  action: "create" | "update" | "skip";
  reason: string;
};
