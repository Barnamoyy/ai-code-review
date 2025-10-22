import axios from "axios";
import { runAIReview } from "./aiReviewService.js";
import { octokit } from "../utils/githubClient.js";
import { createLog } from "../routes/api/logs.js";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const baseUrl = `http://localhost:${process.env.PORT || 8080}/api`;

export async function deletePreviousAIComments(repo, prNumber) {
  const [owner, repoName] = repo.split("/");

  await createLog("info", "Deleting previous AI comments", {
    source: "github_api",
    repo,
    prNumber,
  });

  // login as the bot user and store all the comments in the ai comments array

  try {
    const { data: botUser } = await octokit.users.getAuthenticated();
    const botLogin = botUser.login;

    const aiComments = [];
    const comments = await octokit.paginate(
      octokit.pulls.listReviewComments,
      { owner, repo: repoName, pull_number: prNumber, per_page: 100 }
    );
    
    for (const comment of comments) {
      if (comment.user && comment.user.login === botLogin) {
        aiComments.push(comment);
      }
    }

    // delete every comment in the ai comment
    for (const comment of aiComments) {
      try {
        await octokit.pulls.deleteReviewComment({ owner, repo: repoName, comment_id: comment.id });
      } catch (err) {
        await createLog("warn", `Could not delete comment #${comment.id}`, {
          source: "github_api",
          repo,
          prNumber,
          error: err.message,
        });
        console.error(`Could not delete comment #${comment.id}:`, err.message);
      }
    }
    await createLog("info", `Deleted ${aiComments.length} AI comments`, {
      source: "github_api",
      repo,
      prNumber,
      deletedCount: aiComments.length,
    });
  } catch (err) {
    await createLog("error", "Error deleting AI comments", {
      source: "github_api",
      repo,
      prNumber,
      error: err.message,
    });
    console.error("Error deleting previous AI comments:", err.message);
  }
}

export async function handlePullRequestEvent(payload) {
  const repo = payload.repository.full_name;
  const prNumber = payload.pull_request.number;
  const diffUrl = payload.pull_request.diff_url;
  const commitId = payload.pull_request.head.sha;
  const action = payload.action;

  await createLog("info", "Handling PR event", {
    source: "github_webhook",
    repo,
    prNumber,
    action,
    commitId,
  });

  if (action === "opened" || action === "synchronize") {
    try {
      if (action === "synchronize") {
        try {
          await axios.post(`${baseUrl}/addcommit`, {
            repo,
            prNumber,
            commitId,
          });
        } catch (error) {
          console.error("Error adding commit to database:", error.message);
          await createLog("error", "Failed to add commit", {
            source: "github_webhook",
            repo,
            prNumber,
            commitId,
            error: error.message
          });
        }
        
        await deletePreviousAIComments(repo, prNumber);
        
        try {
          await axios.post(`${baseUrl}/deletereview`, {
            repo,
            prNumber,
          });
        } catch (error) {
          console.error("Error deleting review from database:", error.message);
          await createLog("error", "Failed to delete review", {
            source: "github_webhook",
            repo,
            prNumber,
            error: error.message
          });
        }
      }

      const diffResponse = await axios.get(diffUrl, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` },
      });

      const diffText = diffResponse.data;
      await runAIReview(repo, prNumber, diffText, commitId);
    } catch (error) {
      await createLog("error", "Error handling pull request event", {
        source: "github_webhook",
        repo,
        prNumber,
        error: error.message,
      });
      console.error("Error handling pull request event:", error.message);
    }
  }
}

export async function postReviewCommentsBatch(
  repo,
  prNumber,
  comments,
  commitId
) {
  const [owner, repoName] = repo.split("/");

  await createLog("info", "Starting batch review post", {
    source: "github_api",
    repo,
    prNumber,
    commentCount: comments.length,
  });

  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner,
    repo: repoName,
    pull_number: prNumber,
    per_page: 100,
  });

  const fileMap = new Map(files.map((f) => [f.filename, f]));


  // we are getting the comments from the AI response
  const githubComments = [];
  for (const c of comments) {
    const file = fileMap.get(c.path);
    if (!file || !file.patch) {
      console.warn(`File ${c.path} not in PR or has no patch`);
      continue;
    }

    const position = findPositionInPatch(file.patch, c.line);
    if (!position) {
      console.warn(`Line ${c.line} not in diff for ${c.path}`);
      continue;
    }

    githubComments.push({ path: c.path, body: c.comment || c.body || "No comment provided", position });
  }

  const prData = await octokit.pulls.get({
    owner,
    repo: repoName,
    pull_number: prNumber,
  });

  if (githubComments.length === 0) {
    await createLog("warn", "No valid comments to post", {
      source: "github_api",
      repo,
      prNumber,
    });
    console.warn("No valid comments to post");
    return;
  }

  async function retry(fn, retries = 3, delay = 500) {
    try {
      return await fn();
    } catch (err) {
      if (retries === 0) throw err;
      await new Promise((r) => setTimeout(r, delay));
      return retry(fn, retries - 1, Math.min(5000, delay * 2));
    }
  }

  const CHUNK_SIZE = 50;
  const chunks = [];
  for (let i = 0; i < githubComments.length; i += CHUNK_SIZE) chunks.push(githubComments.slice(i, i + CHUNK_SIZE));

  try {
    for (const chunk of chunks) {
      await retry(() =>
        octokit.pulls.createReview({
          owner,
          repo: repoName,
          pull_number: prNumber,
          commit_id: prData.data.head.sha,
          body: "Automated code review by Gemini AI",
          event: "COMMENT",
          comments: chunk,
        })
      );
      console.log(`Posted ${chunk.length} AI review comments`);
    }

    // After successfully posting comments to GitHub, update our database
    try {
      await axios.post(`${baseUrl}/addreview`, { repo, prNumber, comments });
      await axios.post(`${baseUrl}/addpr`, { owner, repo, prNumber });
      await createLog("info", "Successfully added review to database", {
        source: "github_api",
        repo,
        prNumber,
        commentCount: comments.length
      });
    } catch (dbErr) {
      await createLog("error", "Error updating database after review", {
        source: "github_api",
        repo,
        prNumber,
        error: dbErr.message
      });
      console.error("Failed to update database after successful review:", dbErr.message);
    }
  } catch (err) {
    await createLog("error", "Error posting batch review", {
      source: "github_api",
      repo,
      prNumber,
      error: err.response?.data || err.message
    });
    console.error("Error posting batch review:", err.response?.data || err.message);
  }
}

function findPositionInPatch(patch, targetLine) {
  const lines = patch.split("\n");
  let currentLine = 0;
  let position = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const match = line.match(/\+(\d+)/);
      if (match) {
        currentLine = parseInt(match[1]) - 1;
      }
      continue;
    }

    position++;

    if (line.startsWith("+") || line.startsWith(" ")) {
      currentLine++;
      if (currentLine === targetLine) {
        return position;
      }
    }
  }

  return null;
}
