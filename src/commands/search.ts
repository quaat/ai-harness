import { searchIndex } from "../core/rag.js";

export async function searchCommand(query: string, opts: { json?: boolean; topK?: string }) {
  const rows = await searchIndex(process.cwd(), query);
  const limited = rows.slice(0, Number(opts.topK ?? 10));
  if (opts.json) {
    console.log(JSON.stringify(limited, null, 2));
    return;
  }
  if (!limited.length) return console.log("No results.");
  for (const r of limited) console.log(`${r.path}:${r.startLine}-${r.endLine} [${r.heading}]\n${r.text.slice(0, 160)}\n`);
}
