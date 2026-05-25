import { buildIndex } from "../core/rag.js";

export async function indexCommand() {
  const chunks = await buildIndex(process.cwd());
  console.log(`Indexed ${chunks} chunks.`);
}
