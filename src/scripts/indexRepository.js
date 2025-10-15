import { octokit } from "../utils/githubClient.js";
import { pinecone } from "../utils/pineconeClient.js";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({});
const index = pinecone.Index("repo-context");

const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.cs', '.md'];
const IGNORE_PATTERNS = ['node_modules', 'dist', 'build', '.git', 'coverage', '.next', 'package-lock.json', 'yarn.lock'];

async function fetchRepoFiles(owner, repo, path = '', branch = 'main') {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref: branch });
    let files = [];

    for (const item of data) {
      if (IGNORE_PATTERNS.some(pattern => item.path.includes(pattern))) continue;

      if (item.type === 'file' && CODE_EXTENSIONS.some(ext => item.name.endsWith(ext))) {
        files.push(item);
      } else if (item.type === 'dir') {
        files = files.concat(await fetchRepoFiles(owner, repo, item.path, branch));
      }
    }
    return files;
  } catch (error) {
    console.error(`Error fetching ${path}:`, error.message);
    return [];
  }
}

async function fetchFileContent(owner, repo, path, branch = 'main') {
  try {
    const { data } = await octokit.repos.getContent({
      owner, repo, path, ref: branch,
      headers: { accept: 'application/vnd.github.raw+json' }
    });
    return data;
  } catch (error) {
    console.error(`Error fetching content for ${path}:`, error.message);
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
      contents: [{ parts: [{ text }] }]
    });
    return response.embeddings[0].values;
  } catch (error) {
    console.error("Error generating embedding:", error.message);
    return null;
  }
}

async function indexFile(owner, repo, file) {
  const content = await fetchFileContent(owner, repo, file.path);
  
  if (!content || typeof content !== 'string') {
    return 0;
  }

  const chunks = chunkText(content);
  const vectors = [];

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await generateEmbedding(chunks[i]);
    if (!embedding) continue;

    vectors.push({
      id: `${file.sha}-chunk-${i}`,
      values: embedding,
      metadata: {
        path: file.path,
        content: chunks[i],
        chunkIndex: i,
        totalChunks: chunks.length,
        repo: `${owner}/${repo}`,
        fileType: file.name.split('.').pop()
      }
    });
  }

  if (vectors.length > 0) {
    await index.upsert(vectors);
  }

  return vectors.length;
}

export async function deleteRepoIndex(repoFullName) {
  try {
    const queryResponse = await index.query({
      vector: new Array(768).fill(0),
      topK: 10000,
      includeMetadata: true,
      filter: {
        repo: { $eq: repoFullName }
      }
    });

    const vectorIds = queryResponse.matches.map(match => match.id);

    if (vectorIds.length > 0) {
      const batchSize = 1000;
      for (let i = 0; i < vectorIds.length; i += batchSize) {
        const batch = vectorIds.slice(i, i + batchSize);
        await index.deleteMany(batch);
      }
    } else {
      console.log(`No vectors found for ${repoFullName}`);
    }
  } catch (error) {
    console.error(`Error deleting index for ${repoFullName}:`, error.message);
  }
}

export async function indexRepository(repoFullName, branch = 'main') {
  const [owner, repo] = repoFullName.split('/');

  const files = await fetchRepoFiles(owner, repo, '', branch);

  let totalChunks = 0;

  for (let i = 0; i < files.length; i++) {
    totalChunks += await indexFile(owner, repo, files[i]);

    if (i % 10 === 0 && i > 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repo = process.argv[2];
  const branch = process.argv[3] || 'main';

  if (!repo) {
    console.error('Usage: node indexRepository.js <owner/repo> [branch]');
    process.exit(1);
  }

  indexRepository(repo, branch).catch(console.error);
}
