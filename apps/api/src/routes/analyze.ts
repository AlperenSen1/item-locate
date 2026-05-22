import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { HumanMessage } from "@langchain/core/messages"
import { HTTPException } from "hono/http-exception"
import { type AppVariables } from "../types.ts"
import { config } from "../../utils/config.ts"
import { readFileSync } from "fs"
import { z } from "zod"
import { pathAnalyzeSchema } from "@item-locate/types"

const app = new Hono<{ Variables: AppVariables }>()
// POST /analyze
app.post("/", zValidator("json", pathAnalyzeSchema), async (c) => {
  const { closeUpPath, widePath } = c.req.valid("json")

  const closeUpBase64 = readFileSync(closeUpPath).toString("base64")
  const wideBase64 = readFileSync(widePath).toString("base64")

  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash-lite",
    apiKey: config.googleApiKey,
  })

  const message = new HumanMessage({
    content: [
      {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${closeUpBase64}` },
      },
      {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${wideBase64}` },
      },
      {
        type: "text",
        text: "Bu iki fotoğrafa bakarak nesnenin ne olduğunu ve nerede durduğunu tek bir cümleyle Türkçe açıkla.",
      },
    ],
  })

  const response = await model.invoke([message])
  return c.json({ result: response.content })
})

export default app
