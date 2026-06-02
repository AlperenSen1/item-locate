import { GoogleGenAI } from "@google/genai"
import { config } from "../utils/config.ts"

const genAI = new GoogleGenAI({ apiKey: config.googleApiKey })

export async function getImageEmbedding(imageBase64: string): Promise<number[]> {
  const response = await genAI.models.embedContent({
    model: "gemini-embedding-2",
    contents: [{
      inlineData: {
        mimeType: "image/jpeg",
        data: imageBase64
      }
    }],
    config: {
        outputDimensionality: 768
      }
  })

  if (!response.embeddings?.[0]?.values) {
    throw new Error("Embedding can not be generated")
  }

  return response.embeddings[0].values
}
