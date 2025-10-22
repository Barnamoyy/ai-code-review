import { octokit } from "../utils/githubClient.js";
import { pinecone } from "../utils/pineconeClient.js";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { sendLog } from "../app.js";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const index = pinecone.Index("repo-context");

const CODE_EXTENSIONS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".java",
  ".cpp",
  ".c",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".cs",
  ".md",
];
const IGNORE_PATTERNS = [
  "node_modules",
  "dist",
  "build",
  ".git",
  "coverage",
  ".next",
  "package-lock.json",
  "yarn.lock",
];

// Tunable parameters
const MAX_FILE_SIZE = 1024 * 1024; // 1 MB
const BLOB_FETCH_CONCURRENCY = 8;
const EMBEDDING_CONCURRENCY = 4;
const UPSERT_BATCH_SIZE = 100;

// Use git tree API to list all files in one call (recursive)
async function fetchRepoFiles(owner, repo, branch = "main") {
  try {
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const treeResponse = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: refData.object.sha,
      recursive: "1",
    });
    const files = (treeResponse.data.tree || [])
      .filter((item) => item.type === "blob")
      .map((item) => ({ path: item.path, sha: item.sha }));

    // Filter by extension and ignore patterns
    return files.filter((f) => {
      if (IGNORE_PATTERNS.some((pattern) => f.path.includes(pattern)))
        return false;
      return CODE_EXTENSIONS.some((ext) => f.path.endsWith(ext));
    });
  } catch (error) {
    console.error(
      `Error fetching tree for ${owner}/${repo}@${branch}:`,
      error.message
    );
    return [];
  }
}

// Fetch blob content by SHA to avoid additional ref resolution and to get size
async function fetchBlobBySha(owner, repo, sha) {
  try {
    const { data } = await octokit.git.getBlob({ owner, repo, file_sha: sha });
    // data.content is base64 encoded
    const content = Buffer.from(data.content, "base64").toString("utf8");
    return { content, size: Buffer.byteLength(content, "utf8") };
  } catch (error) {
    console.error(`Error fetching blob ${sha}:`, error.message);
    return null;
  }
}

function chunkText(text, maxChunkSize = 1000, overlap = 200) {
  const chunks = [];
  for (let start = 0; start < text.length; start += maxChunkSize - overlap) {
    chunks.push(text.slice(start, Math.min(start + maxChunkSize, text.length)));
  }
  return chunks;
}

async function generateEmbedding(text) {
  try {
    const response = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: [{ parts: [{ text }] }],
    });
    return response.embeddings[0].values;
  } catch (error) {
    console.error("Error generating embedding:", error.message);
    return null;
  }
}

async function indexFile(owner, repo, file) {
  const blob = await fetchBlobBySha(owner, repo, file.sha);
  if (!blob || !blob.content) return 0;
  if (blob.size > MAX_FILE_SIZE) {
    console.warn(
      `Skipping ${file.path} (${blob.size} bytes) - exceeds ${MAX_FILE_SIZE} limit`
    );
    return 0;
  }

  const chunks = chunkText(blob.content);
  const vectors = [];

  for (let i = 0; i < chunks.length; i++) {
    vectors.push({
      id: `${file.sha}-chunk-${i}`,
      text: chunks[i],
      metadata: {
        path: file.path,
        chunkIndex: i,
        totalChunks: chunks.length,
        repo: `${owner}/${repo}`,
        fileType: file.path.split(".").pop(),
      },
    });
  }

  // Generate embeddings with limited concurrency in batches
  const batchedVectors = [];
  for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
    batchedVectors.push(vectors.slice(i, i + UPSERT_BATCH_SIZE));
  }

  let created = 0;
  for (const batch of batchedVectors) {
    // Generate embeddings for the batch in parallel with limited concurrency
    const embeddingPromises = batch.map((v) => generateEmbedding(v.text));
    const embeddings = await Promise.all(embeddingPromises);

    const upsertVectors = [];
    for (let i = 0; i < embeddings.length; i++) {
      const emb = embeddings[i];
      if (!emb) continue;
      upsertVectors.push({
        id: batch[i].id,
        values: emb,
        metadata: batch[i].metadata,
      });
    }

    if (upsertVectors.length > 0) {
      await index.upsert(upsertVectors);
      created += upsertVectors.length;
    }
  }

  return created;
}

export async function deleteRepoIndex(repoFullName) {
  try {
    const queryResponse = await index.query({
      vector: new Array(768).fill(0),
      topK: 10000,
      includeMetadata: true,
      filter: {
        repo: { $eq: repoFullName },
      },
    });

    const vectorIds = queryResponse.matches.map((match) => match.id);

    if (vectorIds.length > 0) {
      const batchSize = 1000;
      for (let i = 0; i < vectorIds.length; i += batchSize) {
        const batch = vectorIds.slice(i, i + batchSize);
        await index.deleteMany(batch);
      }
      sendLog({
        type: "info", 
        message: "Deleted old repository index from pinecone",
        source: "pinecone_api",
      })
    } else {
      console.log(`No vectors found for ${repoFullName}`);
      sendLog({
        type: "warn", 
        message: `No vectors found for ${repoFullName}`,
        source: "pinecone_api",
      })
    }
  } catch (error) {
    console.error(`Error deleting index for ${repoFullName}:`, error.message);
    sendLog({
      type: "error", 
      message: `Error deleting index for ${repoFullName}`,
      source: "pinecone_api",
    })
  }
}

export async function indexRepository(repoFullName, branch = "main") {
  const [owner, repo] = repoFullName.split("/");
  const files = await fetchRepoFiles(owner, repo, branch);

  let totalChunks = 0;

  // Process files with a small concurrency pool to avoid overwhelming API
  const concurrency = BLOB_FETCH_CONCURRENCY;
  let indexPtr = 0;

  async function worker() {
    while (indexPtr < files.length) {
      const i = indexPtr++;
      try {
        totalChunks += await indexFile(owner, repo, files[i]);
      } catch (err) {
        console.error(`Error indexing ${files[i].path}:`, err.message);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);

  sendLog({
    type: "info", 
    message: "Added new repository context to pinecone", 
    source: "pinecone_api",
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repo = process.argv[2];
  const branch = process.argv[3] || "main";

  if (!repo) {
    console.error("Usage: node indexRepository.js <owner/repo> [branch]");
    process.exit(1);
  }

  indexRepository(repo, branch).catch(console.error);
}
