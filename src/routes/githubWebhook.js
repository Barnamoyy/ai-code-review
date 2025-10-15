import express from "express";
import { handlePullRequestEvent } from "../services/githubService.js";
import { indexRepository, deleteRepoIndex } from "../scripts/indexRepository.js";

export const githubWebhookRouter = express.Router();

githubWebhookRouter.post("/github", async (req, res) => {
  const event = req.header("x-github-event");
  const payload = req.body;
    
  switch (event) {
    case "pull_request":
      if (["opened", "synchronize"].includes(payload.action)) {
        handlePullRequestEvent(payload).catch(console.error);
        res.status(200).json({ message: "PR review triggered" });
      }
      else if (payload.action === "closed" && payload.pull_request.merged) {
        const repo = payload.repository.full_name;
        const baseBranch = payload.pull_request.base.ref;
  
        (async () => {
          await deleteRepoIndex(repo);
          await indexRepository(repo, baseBranch);
        })().catch(console.error);
        
        res.status(200).json({ message: "Re-indexing repository after merge" });
      } else {
        res.status(200).json({ message: "Webhook received" });
      }
      break;
    default:
      res.status(200).json({ message: "Webhook received" });
  }
});
