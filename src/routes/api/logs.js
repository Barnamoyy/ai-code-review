import express from "express";
import client from "../../utils/postgresClient.js";
import { v4 as uuidv4 } from "uuid";

const logsRouter = express.Router();

export const createLog = async (level, message, context = {}) => {
  const id = uuidv4();
  const timestamp = new Date();

  try {
    await client.query(
      `INSERT INTO application_logs (id, level, message, context, timestamp, source, repo, pr_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        level,
        message,
        JSON.stringify(context),
        timestamp,
        context.source || "app",
        context.repo || null,
        context.prNumber || null,
      ]
    );

    console.log(`[${level.toUpperCase()}] ${message}`, context);
  } catch (err) {
    console.error("Failed to create log:", err.message);
  }
};

export const cleanupOldLogs = async () => {
  try {
    const result = await client.query(
      `DELETE FROM application_logs 
       WHERE timestamp < NOW() - INTERVAL '24 hours'`
    );
    console.log(`🧹 Cleaned up ${result.rowCount} logs older than 24 hours`);
    return result.rowCount;
  } catch (err) {
    console.error("Failed to cleanup logs:", err.message);
    return 0;
  }
};

logsRouter.get("/logs", async (req, res) => {
  try {
    const {
      level,
      source,
      repo,
      prNumber,
      limit = 100,
      offset = 0,
    } = req.query;

    let query = "SELECT * FROM application_logs WHERE 1=1";
    const params = [];
    let paramCount = 1;

    if (level) {
      query += ` AND level = $${paramCount++}`;
      params.push(level);
    }

    if (source) {
      query += ` AND source = $${paramCount++}`;
      params.push(source);
    }

    if (repo) {
      query += ` AND repo = $${paramCount++}`;
      params.push(repo);
    }

    if (prNumber) {
      query += ` AND pr_number = $${paramCount++}`;
      params.push(parseInt(prNumber));
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await client.query(query, params);

    const logs = result.rows.map((row) => ({
      ...row,
      context:
        typeof row.context === "string"
          ? JSON.parse(row.context)
          : row.context,
    }));

    res.json({
      success: true,
      data: logs,
      count: logs.length,
    });
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

logsRouter.post("/logs", async (req, res) => {
  try {
    const { level, message, context } = req.body;

    if (!level || !message) {
      return res.status(400).json({
        success: false,
        error: "level and message are required",
      });
    }

    await createLog(level, message, context || {});

    res.json({
      success: true,
      message: "Log created successfully",
    });
  } catch (error) {
    console.error("Error creating log:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

logsRouter.delete("/logs/cleanup", async (req, res) => {
  try {
    const deletedCount = await cleanupOldLogs();

    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} old logs`,
      deletedCount,
    });
  } catch (error) {
    console.error("Error during cleanup:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default logsRouter;
