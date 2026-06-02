import { GoogleVertexAIMultimodalEmbeddings } from "@langchain/community/experimental/multimodal_embeddings/googlevertexai";

const embeddingModel = new GoogleVertexAIMultimodalEmbeddings();

export async function getImageEmbedding(imageBase64: string): Promise<number[]> {
  const buffer = Buffer.from(imageBase64, "base64");
  return await embeddingModel.embedImageQuery(buffer);
}
