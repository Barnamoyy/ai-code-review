import { getRepoContext } from "./pineconeService.js";

export async function buildPromptWithContext(repo, diff) {
  const contextText = await getRepoContext(diff, repo); // Pass repo here

  if (!contextText) {
    return `No repository context available. Review based on general best practices.\n\nDiff:\n${diff}`;
  }

  return `Repository context:\n${contextText}\n\nDiff:\n${diff}`;
}
