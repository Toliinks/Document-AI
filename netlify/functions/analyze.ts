import type { Handler } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { prompt, fileData, mimeType } = JSON.parse(event.body || "{}");

    if (!prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Prompt is required" }),
      };
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    const generateWithModel = async (modelName: string) => {
      if (fileData && mimeType) {
        const base64Data = fileData.split(",")[1] || fileData;
        return await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { inlineData: { data: base64Data, mimeType } },
              ],
            },
          ],
        });
      } else {
        return await ai.models.generateContent({
          model: modelName,
          contents: prompt,
        });
      }
    };

    const response = await generateWithModel("gemini-2.5-flash");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result: response.text }),
    };
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Failed to analyze document." }),
    };
  }
};

export { handler };
