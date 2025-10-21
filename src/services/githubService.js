import axios from "axios";
import { runAIReview } from "./aiReviewService.js";
import { octokit } from "../utils/githubClient.js";
import { createLog } from "../routes/api/logs.js";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const baseUrl = `http://localhost:8080/api`;

export async function deletePreviousAIComments(repo, prNumber) {
  const [owner, repoName] = repo.split("/");

  await createLog("info", "Deleting previous AI comments", {
    source: "github_api",
    repo,
    prNumber,
  });

  try {
    const { data: botUser } = await octokit.users.getAuthenticated();
    const botLogin = botUser.login;

    const { data: comments } = await octokit.pulls.listReviewComments({
      owner,
      repo: repoName,
      pull_number: prNumber,
    });

    const aiComments = comments.filter(
      (comment) => comment.user.login === botLogin
    );

    for (const comment of aiComments) {
      try {
        await octokit.pulls.deleteReviewComment({
          owner,
          repo: repoName,
          comment_id: comment.id,
        });
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
        await axios.post(`${baseUrl}/addcommit`, {
          repo,
          prNumber,
          commitId,
        });
        await deletePreviousAIComments(repo, prNumber);
        await axios.post(`${baseUrl}/deletereview`, {
          repo,
          prNumber,
        });
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

  const githubComments = comments
    .map((c) => {
      const file = fileMap.get(c.path);
      if (!file || !file.patch) {
        console.warn(`File ${c.path} not in PR or has no patch`);
        return null;
      }

      const position = findPositionInPatch(file.patch, c.line);
      if (!position) {
        console.warn(`Line ${c.line} not in diff for ${c.path}`);
        return null;
      }

      return {
        path: c.path,
        body: c.comment || c.body || "No comment provided",
        position: position,
      };
    })
    .filter(Boolean);

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

  try {
    const response = await octokit.pulls.createReview({
      owner,
      repo: repoName,
      pull_number: prNumber,
      commit_id: prData.data.head.sha,
      body: "Automated code review by Gemini AI",
      event: "COMMENT",
      comments: githubComments,
    });

    console.log(`Posted ${githubComments.length} AI review comments`);

    if (response.status === 200 || response.status === 201) {
      await axios.post(`${baseUrl}/addreview`, {
        repo,
        prNumber,
        comments,
      });
      await axios.post(`${baseUrl}/addpr`, {
        owner, 
        repo, 
        prNumber
      })
    }
  } catch (err) {
    await createLog("error", "Error posting batch review", {
      source: "github_api",
      repo,
      prNumber,
      error: err.message,
    });
    console.error(
      "Error posting batch review:",
      err.response?.data || err.message
    );
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
