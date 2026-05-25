import { searchIndex } from "../core/rag.js";

export async function searchCommand(query: string, opts: { json?: boolean; topK?: string }) {
  const rows = await searchIndex(process.cwd(), query);
  const limited = rows.slice(0, Number(opts.topK ?? 10));
  if (opts.json) {
    console.log(JSON.stringify(limited, null, 2));
    return;
  }
  if (!limited.length) return console.log("No results.");
  for (const [i, r] of limited.entries()) {
    console.log(`#${i + 1} ${r.path}:${r.startLine}-${r.endLine}`);
    console.log(`Heading: ${r.heading}`);
    console.log(`Snippet: ${r.text.slice(0, 160)}`);
    console.log("");
  }
  console.log("Read only these paths/line ranges unless more context is needed.");
}
