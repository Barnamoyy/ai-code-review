import express from "express";
import client from "../../utils/postgresClient.js";
import { v4 as uuidv4 } from "uuid";

export const commitsRouter = express.Router();

commitsRouter.get("/getallcommits", async (req, res) => {
  try {
    const response = await client.query("SELECT * FROM commit_history");
    res.json(response.rows);
  } catch (error) {
    console.error("Error fetching commits:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

commitsRouter.get("/getcommits", async (req, res) => {
  const { repo } = req.body;
  try {
    const response = await client.query(
      "SELECT * FROM commit_history WHERE repo = $1",
      [repo]
    );
    res.json(response.rows);
  } catch (error) {
    console.error("Error fetching commits:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

commitsRouter.post("/getcommit", async (req, res) => {
  const { repo, prNumber } = req.body;
  try {
    const response = await client.query(
      "SELECT * FROM commit_history WHERE repo = $1 AND pr_number = $2",
      [repo, prNumber]
    );
    res.json(response.rows);
  } catch (error) {
    console.error("Error fetching commit:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

commitsRouter.post("/addcommit", async (req, res) => {
  const id = uuidv4();
  const date = new Date();
  const {repo, prNumber, commitId} = req.body;

  try {
    await client.query(
      `INSERT INTO commit_history (id, repo, pr_number, commit_id, created_at) 
      VALUES ($1, $2, $3, $4, $5)`,
      [id, repo, prNumber, commitId, date]
    );

    console.log("Logged commits");
    res.sendStatus(200);
  } catch (error) {
    console.error("Error logging commits:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
