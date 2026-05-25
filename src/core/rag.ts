import fs from "fs-extra";
import path from "node:path";

type Chunk = { id: string; path: string; startLine: number; endLine: number; heading: string; text: string; keywords: string[] };

function keywords(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z]{4,}/g) ?? [])].slice(0, 20);
}

export async function buildIndex(root: string): Promise<number> {
  const files = ["README.md", "AGENTS.md", "CLAUDE.md"].filter((f) => fs.existsSync(path.join(root, f)));
  const chunks: Chunk[] = [];
  for (const file of files) {
    const text = await fs.readFile(path.join(root, file), "utf8");
    const lines = text.split("\n");
    chunks.push({ id: file.replace(/[^a-z0-9]/gi, "-").toLowerCase(), path: file, startLine: 1, endLine: lines.length, heading: "document", text, keywords: keywords(text) });
  }
  await fs.ensureDir(path.join(root, ".ai/rag"));
  await fs.writeFile(path.join(root, ".ai/rag/index.jsonl"), chunks.map((c) => JSON.stringify(c)).join("\n") + (chunks.length ? "\n" : ""));
  await fs.writeJson(path.join(root, ".ai/rag/manifest.json"), { version: 1, chunks: chunks.length, generatedAt: new Date().toISOString() }, { spaces: 2 });
  return chunks.length;
}

export async function searchIndex(root: string, query: string): Promise<Chunk[]> {
  const p = path.join(root, ".ai/rag/index.jsonl");
  if (!(await fs.pathExists(p))) return [];
  const rows = (await fs.readFile(p, "utf8")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Chunk);
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return rows
    .map((row) => ({ row, score: tokens.reduce((n, t) => n + (row.text.toLowerCase().includes(t) ? 1 : 0), 0) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((r) => r.row);
}
