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

export async function getImageDescription(
  imageBase64: string,
  itemName: string,
  containerName?: string
): Promise<string> {

  // Container bulunduysak daha spesifik prompt kullan
  const prompt = containerName
    ? `Look at this photo. The item "${itemName}" was placed somewhere in this scene, specifically in "${containerName}". Based on what you see, describe its location in one short sentence. For example: "In the top drawer of the Şifonyer."`
    : `Look at this photo. The item "${itemName}" was placed somewhere in this scene. Based on the surroundings you see, describe where it was likely placed in one short sentence. Focus on the furniture or container visible, not the floor or background.`;

  const response = await genAI.models.generateContent({
    model: "gemini-3.5-flash",
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: imageBase64
          }
        },
        { text: prompt }
      ]
    }]
  })

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    throw new Error("Description can not be generated")
  }
  return text
}
