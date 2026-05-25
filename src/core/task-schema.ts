import { z } from "zod";

export const taskIdSchema = z.string().regex(/^[a-z0-9_-]+$/, "Task ID must contain only lowercase letters, numbers, '-' or '_'.");
export const checkStateSchema = z.enum(["pending", "passed", "failed", "skipped"]);
export const taskStatusSchema = z.enum([
  "created", "context-ready", "implementation-prompt-ready", "implementing", "implemented", "tests-passed", "committed",
  "codex-review-ready", "codex-reviewed", "changes-requested", "hardening-prompt-ready", "hardening", "hardened", "ready-for-pr", "pr-opened", "done"
]);

export const taskManifestSchema = z.object({
  id: taskIdSchema,
  title: z.string().min(1),
  branch: z.string().min(1),
  baseBranch: z.string().min(1),
  status: taskStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  artifacts: z.object({
    prompt: z.string(), context: z.string(), claudeImplement: z.string(), implementation: z.string(), tests: z.string(),
    codexReviewPrompt: z.string(), codexReview: z.string(), claudeFixInstructions: z.string(), hardening: z.string(), pr: z.string()
  }),
  checks: z.object({ typecheck: checkStateSchema, test: checkStateSchema, build: checkStateSchema }),
  commits: z.object({ implementation: z.string().nullable(), hardening: z.string().nullable() }),
  pullRequest: z.object({ number: z.number().nullable(), url: z.string().nullable() })
});

export type TaskManifest = z.infer<typeof taskManifestSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export function validateTaskId(taskId: string) {
  const res = taskIdSchema.safeParse(taskId);
  if (!res.success) throw new Error(`Invalid task ID '${taskId}'. Use lowercase letters, numbers, '-' and '_' only.`);
}
