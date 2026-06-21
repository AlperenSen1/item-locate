import { GoogleGenAI } from "@google/genai"
import { config } from "../utils/config.ts"

const genAI = new GoogleGenAI({ apiKey: config.googleApiKey })

// getImageEmbedding — Girdi: base64 görsel (imageBase64). Görseli Gemini'nin multimodal embedding modeline (gemini-embedding-2)
// gönderip 768 boyutlu bir vektör üretir; bu vektör container eşleştirmesinde pgvector cosine similarity için kullanılır.
// Çıktı: number[] (768 uzunluğunda embedding). Embedding üretilemezse hata fırlatır.
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


//item için
// getImageDescription — Girdi: base64 görsel (imageBase64), itemName ve opsiyonel containerName. Görseli prompt'la birlikte
// gemini-3.5-flash'a gönderir; containerName verilirse item'ın o container içindeki yerini anlatan daha spesifik, verilmezse
// sahnedeki mobilyaya göre generic bir prompt kullanır ve item'ın yerini tek cümlelik bir açıklama olarak üretir.
// Çıktı: string (lokasyon açıklaması). Açıklama üretilemezse hata fırlatır.
export async function getImageDescription(
  imageBase64: string,
  itemName: string,
  containerName?: string
): Promise<string> {
  // Container bulunduysa daha spesifik prompt kullan
  const prompt = containerName
    ? `Look at this photo. The item "${itemName}" was placed somewhere in this scene, specifically in "${containerName}". Based on what you see, describe its location in one short sentence. For example: "In the top drawer of the Şifonyer."`
    : `Look at this photo. The item "${itemName}" was placed somewhere in this scene. Based on the surroundings you see, describe where it was likely placed in one short sentence. Focus on the furniture or container visible, not the floor or background.`;

  const response = await genAI.models.generateContent({
    model: "gemini-3.5-flash",
    contents: [
      {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: prompt },
        ],
      },
    ],
  });

  const text = response.text; // SDK accessor — tüm text part'larını birleştirir, thought'ları atlar
  if (!text) {
    throw new Error("Description can not be generated");
  }
  return text;
}

// getContainerDescription — Girdi: base64 görsel (imageBase64), containerName ve opsiyonel premiseName.
// premiseName verilirse container'ın o premise içinde olduğunu da belirten daha spesifik, verilmezse
// yalnızca container name'e dayalı generic bir prompt kullanır. Görseli prompt'la birlikte
// gemini-3.5-flash'a gönderir ve container ile içeriğini tek bir kısa ifadeyle açıklar.
// Çıktı: string (örn. "wicker box holding some cables in the office"). Açıklama üretilemezse hata fırlatır.
export async function getContainerDescription(
  imageBase64: string,
  containerName: string,
  premiseName?: string
): Promise<string> {
  // Premise bulunduysa konumu da içeren daha spesifik prompt kullan
  const prompt = premiseName
    ? `Look at this photo of a container named "${containerName}", located in a place called "${premiseName}". ` +
      `Describe the container and what it holds in one short phrase. Start with its name, then its main visible contents, ` +
      `and end with the location. For example: "wicker box holding some cables in the office". Return only the phrase, with no extra text.`
    : `Look at this photo of a container named "${containerName}". ` +
      `Describe the container and what it holds in one short phrase. Start with its name, then its main visible contents. ` +
      `For example: "wicker box holding some cables". Return only the phrase, with no extra text.`;

  const response = await genAI.models.generateContent({
    model: "gemini-3.5-flash",
    contents: [
      {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: prompt },
        ],
      },
    ],
  });

  const text = response.text;
  if (!text) {
    throw new Error("Description can not be generated");
  }
  return text;
}
