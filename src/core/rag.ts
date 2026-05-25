import fs from "fs-extra";
import path from "node:path";
import YAML from "yaml";

type Chunk = { id: string; path: string; startLine: number; endLine: number; heading: string; text: string; keywords: string[] };
const SECRET_PATTERNS = [/^\.env(\..+)?$/, /\.pem$/, /\.key$/, /\.p12$/, /\.pfx$/, /id_rsa$/, /id_ed25519$/, /credentials\.json$/, /^secrets\./];
const EXCLUDED_DIRS = ["node_modules", "dist", "build", "coverage", ".git"];
const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".c", ".cpp"]);
const DATA_EXTS = new Set([".json", ".yaml", ".yml", ".toml"]);

function kws(text: string): string[] { return [...new Set(text.toLowerCase().match(/[a-z]{4,}/g) ?? [])].slice(0, 20); }
function shouldSkip(rel: string, excludes: string[]): boolean {
  const base = path.basename(rel);
  if (SECRET_PATTERNS.some((p) => p.test(base))) return true;
  if (EXCLUDED_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`))) return true;
  return excludes.some((x) => rel === x || rel.startsWith(`${x}/`) || base === x || (x.startsWith("*.") && base.endsWith(x.slice(1))));
}

function chunkMarkdown(rel: string, text: string): Chunk[] { /* same */
  const lines = text.split("\n"); const chunks: Chunk[] = []; let start = 1, heading = "document", buf: string[] = [];
  const push = (end: number) => { if (!buf.length) return; const t = buf.join("\n").trim(); if (!t) return; chunks.push({ id: `${rel}-${start}-${end}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase(), path: rel, startLine: start, endLine: end, heading, text: t, keywords: kws(t) }); };
  lines.forEach((line, i) => { if (/^#{1,6}\s+/.test(line)) { push(i); heading = line.replace(/^#{1,6}\s+/, ""); start = i + 1; buf = [line]; } else buf.push(line); });
  push(lines.length); return chunks;
}
function chunkLines(rel: string, text: string, window = 80): Chunk[] {
  const lines = text.split("\n"); const chunks: Chunk[] = [];
  for (let i = 0; i < lines.length; i += window) {
    const start = i + 1; const end = Math.min(lines.length, i + window); const t = lines.slice(i, end).join("\n").trim();
    if (!t) continue; chunks.push({ id: `${rel}-${start}-${end}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase(), path: rel, startLine: start, endLine: end, heading: "lines", text: t, keywords: kws(t) });
  }
  return chunks;
}

async function collectFiles(root: string, include: string[], excludes: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const item of include) {
    if (shouldSkip(item, excludes)) continue;
    const p = path.join(root, item);
    if (!(await fs.pathExists(p))) continue;
    const st = await fs.stat(p);
    if (st.isFile()) { out.push(item); continue; }
    const entries = await fs.readdir(p);
    for (const e of entries) {
      const rel = path.join(item, e);
      if (shouldSkip(rel, excludes)) continue;
      const child = path.join(root, rel);
      if ((await fs.stat(child)).isDirectory()) out.push(...await collectFiles(root, [rel], excludes));
      else out.push(rel);
    }
  }
  return out;
}

export async function buildIndex(root: string): Promise<number> {
  const cfgPath = path.join(root, "ai-harness.config.yaml");
  const cfg = (await fs.pathExists(cfgPath)) ? YAML.parse(await fs.readFile(cfgPath, "utf8")) : {};
  const include: string[] = cfg?.rag?.include ?? ["README.md", "AGENTS.md", "CLAUDE.md"];
  const exclude: string[] = cfg?.rag?.exclude ?? [];
  const files = await collectFiles(root, include, exclude);
  const chunks: Chunk[] = [];
  for (const rel of files) {
    const text = await fs.readFile(path.join(root, rel), "utf8").catch(() => "");
    if (!text.trim()) continue;
    const ext = path.extname(rel).toLowerCase();
    if ([".md", ".mdx"].includes(ext)) chunks.push(...chunkMarkdown(rel, text));
    else if (CODE_EXTS.has(ext) || DATA_EXTS.has(ext)) chunks.push(...chunkLines(rel, text));
    else chunks.push(...chunkLines(rel, text, 120));
  }
  await fs.ensureDir(path.join(root, ".ai/rag"));
  await fs.writeFile(path.join(root, ".ai/rag/index.jsonl"), chunks.map((c) => JSON.stringify(c)).join("\n") + (chunks.length ? "\n" : ""));
  await fs.writeJson(path.join(root, ".ai/rag/manifest.json"), { version: 1, chunks: chunks.length, generatedAt: new Date().toISOString(), files: files.length }, { spaces: 2 });
  return chunks.length;
}

export async function searchIndex(root: string, query: string): Promise<Chunk[]> {
  const p = path.join(root, ".ai/rag/index.jsonl");
  if (!(await fs.pathExists(p))) return [];
  const raw = (await fs.readFile(p, "utf8")).trim();
  if (!raw) return [];
  const rows = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Chunk);
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.map((row) => ({ row, score: tokens.reduce((n, t) => n + (row.text.toLowerCase().includes(t) ? 1 : 0), 0) + tokens.reduce((n, t) => n + (row.keywords.includes(t) ? 1 : 0), 0) }))
    .filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 10).map((r) => r.row);
}
