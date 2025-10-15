import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { githubWebhookRouter } from "./routes/githubWebhook.js";
import { commitsRouter } from "./routes/api/commits.js";
import { reviewsRouter } from "./routes/api/reviews.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use("/webhook", githubWebhookRouter);
app.use("/api", commitsRouter, reviewsRouter);

app.get("/", (_, res) => res.send("🚀 AI Code Review Backend running"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

