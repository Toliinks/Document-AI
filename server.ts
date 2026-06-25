import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;
function getAI() {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // AI Analysis Endpoint
  app.post("/api/analyze", async (req, res) => {
    try {
      const { prompt, fileData, mimeType } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      let response;
      const generateWithModel = async (modelName: string) => {
        const aiClient = getAI();
        if (fileData && mimeType) {
          const base64Data = fileData.split(",")[1] || fileData;
          return await aiClient.models.generateContent({
            model: modelName,
            contents: [
              { role: "user", parts: [
                { text: prompt },
                { inlineData: { data: base64Data, mimeType: mimeType } }
              ]}
            ]
          });
        } else {
          return await aiClient.models.generateContent({
            model: modelName,
            contents: prompt
          });
        }
      };

      try {
        response = await generateWithModel("gemini-2.5-flash");
      } catch (error: any) {
        if (error?.status === 503 || error?.message?.includes("503") || error?.message?.includes("UNAVAILABLE")) {
          console.warn("gemini-2.5-flash unavailable, falling back to gemini-1.5-flash...");
          response = await generateWithModel("gemini-1.5-flash");
        } else {
          throw error;
        }
      }

      res.json({ result: response.text });
    } catch (error: any) {
      console.error("AI Analysis Error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze document." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
