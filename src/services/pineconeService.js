import { pinecone } from "../utils/pineconeClient.js";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({});
const index = pinecone.Index("repo-context");

export async function getRepoContext(diff, repo, topK = 5) {
  try {
    const embeddingResponse = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: [{ parts: [{ text: diff }] }],
    });

    const diffEmbedding = embeddingResponse.embeddings[0].values;

    const queryResponse = await index.query({
      vector: diffEmbedding,
      topK,
      includeMetadata: true,
      filter: {
        repo: { $eq: repo } 
      }
    });

    return queryResponse.matches
      .map((match) => match.metadata.content)
      .join("\n\n");
  } catch (err) {
    console.error("Error fetching repo context:", err);
  }
}

export async function buildPromptWithContext(repo, diff) {
  const context = await getRepoContext(diff, repo);
  
  if (!context) {
    return `No repository context available. Review based on general best practices.\n\nDiff:\n${diff}`;
  }
  
  return `Repository Context:\n${context}\n\nDiff:\n${diff}`;
}
