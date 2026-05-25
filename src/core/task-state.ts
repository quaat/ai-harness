export function suggestNext(status: string, taskId: string): string {
  if (status === "created") return `ai-harness task context ${taskId}`;
  if (status === "context-ready") return `ai-harness task claude ${taskId}`;
  if (status === "implementation-prompt-ready") return `Run Claude then ai-harness task commit ${taskId}`;
  if (status === "committed") return `ai-harness task codex-review ${taskId}`;
  if (status === "codex-review-ready") return `Run Codex then ai-harness task hardening ${taskId}`;
  if (status === "hardening-prompt-ready") return `Run Claude then ai-harness task commit ${taskId} --phase hardening`;
  if (status === "hardened") return `ai-harness task pr ${taskId}`;
  return "No suggestion available.";
}
