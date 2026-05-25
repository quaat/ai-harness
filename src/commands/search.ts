import { searchIndex } from "../core/rag.js";

export async function searchCommand(query: string) {
  const results = await searchIndex(process.cwd(), query);
  if (!results.length) {
    console.log("No matches.");
    return;
  }
  for (const r of results) {
    console.log(`${r.path}:${r.startLine}-${r.endLine} ${r.heading}`);
  }
}
