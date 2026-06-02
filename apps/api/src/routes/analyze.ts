import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { ai, AxAIGoogleGeminiModel, type AxChatResponse } from "@ax-llm/ax"
import { type AppVariables } from "../types.ts"
import { config } from "../../utils/config.ts"
import { readFileSync } from "fs"
import { pathAnalyzeSchema } from "@item-locate/types"

const app = new Hono<{ Variables: AppVariables }>()

app.post("/", zValidator("json", pathAnalyzeSchema), async (c) => {
  const { closeUpPath, widePath } = c.req.valid("json")

  const closeUpBase64 = readFileSync(closeUpPath).toString("base64")
  const wideBase64 = readFileSync(widePath).toString("base64")

  const gemini = ai({
    name: "google-gemini",
    apiKey: config.googleApiKey,
    config: { model: AxAIGoogleGeminiModel.Gemini20FlashLite }
  })

  const response = await gemini.chat({
    chatPrompt: [
      {
        role: "user",
        content: [
          { type: "image", image: closeUpBase64, mimeType: "image/jpeg" },
          { type: "image", image: wideBase64, mimeType: "image/jpeg" },
          { type: "text", text: "Bu iki fotoğrafa bakarak nesnenin ne olduğunu ve nerede durduğunu tek bir cümleyle Türkçe açıkla." }
        ]
      }
    ]
  }) as AxChatResponse


  return c.json({ result: response.results[0]?.content })
})

export default app
