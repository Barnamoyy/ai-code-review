import express from "express";
import client from "../../utils/postgresClient.js";

export const usersRouter = express.Router();

// Add a new user
usersRouter.post("/users", async (req, res) => {
  const { github_username, github_access_token } = req.body;

  if (!github_username || !github_access_token) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const existingUser = await client.query(
      "SELECT github_username FROM users WHERE github_username = $1",
      [github_username]
    );

    if (existingUser.rows.length === 0) {
      const result = await client.query(
        "INSERT INTO users (github_username, github_access_token) VALUES ($1, $2) RETURNING id",
        [github_username, github_access_token]
      );
      return res
        .status(201)
        .json({ message: "User added", userId: result.rows[0].id });
    } else {
      return res.status(200).json({ message: "User already exists" });
    }
  } catch (error) {
    console.error("Error adding user:", error);
    res.status(500).json({ message: "Error adding user" });
  }
});

// Fetch a user by username
usersRouter.get("/getuser", async (req, res) => {
  const { github_username } = req.body;

  if (!github_username) {
    return res.status(400).json({ message: "Missing github_username" });
  }

  try {
    const user = await client.query(
      "SELECT * FROM users WHERE github_username = $1",
      [github_username]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user.rows[0]);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Error fetching user" });
  }
});

// Add a new repository linked to a user (joined by user_id)
usersRouter.post("/repositories", async (req, res) => {
  const { repository_name, github_username } = req.body;

  if (!repository_name || !github_username) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const userResult = await client.query(
      "SELECT id FROM users WHERE github_username = $1",
      [github_username]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const userId = userResult.rows[0].id;

    await client.query(
      "INSERT INTO repositories (repository_name, user_id) VALUES ($1, $2)",
      [repository_name, userId]
    );

    res.status(201).json({ message: "Repository added" });
  } catch (error) {
    console.error("Error adding repository:", error);
    res.status(500).json({ message: "Error adding repository" });
  }
});

