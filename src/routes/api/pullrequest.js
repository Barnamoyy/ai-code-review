import express from "express";
import { v4 as uuidv4 } from "uuid";
import client from "../../utils/postgresClient.js";

export const pullRequestRouter = express.Router(); 

pullRequestRouter.post("/addpr", async (req, res) => {
    
    const {owner, repo, prNumber} = req.body;
    const date = new Date();
    try {
        await client.query(
            'INSERT INTO pull_requests (owner, repo, pull_number, created_at) VALUES ($1, $2, $3, $4)',
            [owner, repo, prNumber, date]
          );
        res.status(201).json({message: "Pull request added successfully"}); 
    } catch (error) {
        console.error("Error adding pull request:", error.message);
        res.status(500).json({error: "Internal Server Error"});
    }
})

pullRequestRouter.get("/test", (req, res) => {
    res.send("Test route is working");
});

pullRequestRouter.get("/pullrequests", async (req, res) => {
    try {
        const response = await client.query('SELECT * FROM pull_requests');
        res.status(200).json({success: true, data: response.rows});
    } catch (error) {
        console.error("Error fetching pull requests:", error.message);
        res.status(500).json({error: "Internal Server Error"});
    }
})
