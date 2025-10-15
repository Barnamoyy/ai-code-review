import { GoogleGenAI, Type } from "@google/genai";
import { buildPromptWithContext } from "./ragService.js";
import { postReviewCommentsBatch } from "./githubService.js";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({});

export async function runAIReview(repo, prNumber, diff, commitId) {
  const prompt = await buildPromptWithContext(repo, diff);

  const finalPrompt = `
  You are an AI assistant specializing in code review. Your task is to analyze the provided code changes in this pull request, identify potential issues related to correctness, security, performance, maintainability, and style, and suggest improvements. Prioritize critical issues and provide clear, actionable recommendations with code examples where appropriate. Adhere to established coding standards and best practices for [Language/Framework]. 
  ${prompt} 
  Pull Request Diff: 
  ${diff}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: finalPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              path: {
                type: Type.STRING,
                description: "Relative file path",
              },
              line: {
                type: Type.INTEGER,
                description: "Line number in the new file",
              },
              comment: {
                type: Type.STRING,
                description: "Clear and actionable feedback",
              },
            },
            required: ["path", "line", "comment"],
            propertyOrdering: ["path", "line", "comment"],
          },
        },
      },
    });

    const comments = JSON.parse(response.text);

    await postReviewCommentsBatch(repo, prNumber, comments, commitId);
  } catch (err) {
    console.error(
      "Error running AI review:",
      err.response?.data || err.message
    );
  }
}
