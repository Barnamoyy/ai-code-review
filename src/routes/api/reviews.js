import express from "express";
import client from "../../utils/postgresClient.js";
import { v4 as uuidv4 } from "uuid";

export const reviewsRouter = express.Router();

reviewsRouter.get("/getreviews", async (req, res) => {
  const { repo } = req.body;
  try {
    const response = await client.query(
      "SELECT * FROM review_history WHERE repo = $1 AND deleted_at IS NULL",
      [repo]
    );
    res.status(200).json(response.rows);
  } catch (error) {
    console.error("Error fetching reviews:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

reviewsRouter.get("/getallreviews", async (req, res) => {
  try {
    const response = await client.query(
      "SELECT * FROM review_history WHERE deleted_at IS NULL"
    );
    res.status(200).json(response.rows);
  } catch (error) {
    console.error("Error fetching reviews:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

reviewsRouter.get("/getreview", async (req, res) => {
  const { repo, prNumber } = req.body;
  try {
    const response = await client.query(
      "SELECT * FROM review_history WHERE repo = $1 AND pr_number = $2 AND deleted_at IS NULL",
      [repo, prNumber]
    );
    
    if (response.rows.length === 0) {
      return res.status(404).json({ error: "Review not found" });
    }
    
    res.status(200).json(response.rows[0]);
  } catch (error) {
    console.error("Error fetching review:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

reviewsRouter.post("/addreview", async (req, res) => {
  const { repo, prNumber, comments } = req.body;
  
  if (!repo || !prNumber || !comments) {
    return res.status(400).json({ error: "Missing required fields: repo, prNumber, comments" });
  }
  
  const id = uuidv4();
  const date = new Date();
  const length = comments.length;

  try {
    await client.query(
      `INSERT INTO review_history (id, repo, pr_number, comments, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, repo, prNumber, length, date]
    );

    console.log("Logged review history");
    res.status(201).json({ 
      message: "Review added successfully", 
      id, 
      repo, 
      prNumber, 
      commentsCount: length 
    });
  } catch (err) {
    console.error("Error logging review history:", err.message);
    res.status(500).json({ error: "Failed to add review" });
  }
});

reviewsRouter.post("/deletereview", async (req, res) => {
  const { repo, prNumber } = req.body;
  
  if (!repo || !prNumber) {
    return res.status(400).json({ error: "Missing required fields: repo, prNumber" });
  }
  
  try {
    const result = await client.query(
      `UPDATE review_history
       SET deleted_at = NOW()
       WHERE repo = $1 AND pr_number = $2 AND deleted_at IS NULL`,
      [repo, prNumber]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Review not found or already deleted" });
    }
    
    console.log(`🗑️ Deleted ${result.rowCount} old review history entries for ${repo} PR #${prNumber}`);
    res.status(200).json({ 
      message: "Review deleted successfully", 
      deletedCount: result.rowCount 
    });
  } catch (err) {
    console.error("Error deleting review history:", err.message);
    res.status(500).json({ error: "Failed to delete review" });
  }
});
