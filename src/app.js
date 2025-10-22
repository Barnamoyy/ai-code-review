import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { githubWebhookRouter } from "./routes/githubWebhook.js";
import { commitsRouter } from "./routes/api/commits.js";
import { reviewsRouter } from "./routes/api/reviews.js";
import { pullRequestRouter } from "./routes/api/pullRequest.js";
import { usersRouter } from "./routes/api/users.js";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from 'cors'; 


dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors())

app.use(bodyParser.json());
app.use("/webhook", githubWebhookRouter);
app.use("/api", commitsRouter, reviewsRouter, pullRequestRouter, usersRouter);

app.get("/", (_, res) => res.send("🚀 AI Code Review Backend running"));

io.on("connection", (socket) => {
  console.log("Client connected for log streaming:", socket.id);
  
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

export function sendLog(logData) {
  io.emit("log", {
    timestamp: new Date().toISOString(),
    ...logData
  });
}

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

