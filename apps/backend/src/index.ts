import { Elysia, sse, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { smoothStream, streamText } from "ai";
import { model, SYSTEM_PROMPT } from "./lib/ai";
import {
  createThread,
  startChatMessagePair
} from "./lib/convex";
import type { Id } from "fn/convex/_generated/dataModel";

// Helper to generate thread title from first message
async function generateTitle(content: string): Promise<string> {
  const result = await streamText({
    model,
    system: "Gere um título curto (máximo 4 palavras) para esta conversa baseado na mensagem. Responda APENAS com o título, sem aspas.",
    prompt: content,
  });

  let title = "";
  for await (const chunk of result.textStream) {
    title += chunk;
  }
  return title.trim().slice(0, 50) || "Nova conversa";
}

const app = new Elysia()
  .use(cors({
    credentials: true,
    origin: "*"
  }))
  // Health check
  .get("/", () => "MentalFlow API v1")

  // Create new thread
  .post(
    "/chat/threads",
    async ({ headers, body }) => {
      const token = headers.authorization?.replace("Bearer ", "");
      if (!token) throw new Error("Unauthorized");

      const threadId = await createThread(token, body.title);
      return { threadId };
    },
    {
      body: t.Object({
        title: t.Optional(t.String()),
      }),
    }
  )

  .post(
    "/chat",
    async ({ headers, body }) => {
      console.log("--- New Chat Request ---");
      const token = headers.authorization?.replace("Bearer ", "");
      if (!token) throw new Error("Unauthorized");

      let { threadId, message, messages: incomingMessages } = body;

      // If useChat sends messages instead of message
      if (!message && incomingMessages && incomingMessages.length > 0) {
        const lastMessage = incomingMessages[incomingMessages.length - 1];
        message = lastMessage.content || lastMessage.parts?.[0]?.text;
      }

      if (!message) {
        throw new Error("No message content provided");
      }

      // Delegate entirely to Convex
      const result = await startChatMessagePair(
        token,
        threadId as unknown as Id<"chatThreads">,
        message
      );

      return {
        threadId: result.threadId,
        assistantMessageId: result.assistantMessageId
      };
    },
    {
      body: t.Object({
        threadId: t.Optional(t.String()),
        message: t.Optional(t.String()),
        messages: t.Optional(t.Array(t.Any())),
      }),
    }
  )

  // OpenAI Realtime ephemeral token for WebRTC
  .post(
    "/realtime/token",
    async ({ headers }) => {
      const token = headers.authorization?.replace("Bearer ", "");
      if (!token) throw new Error("Unauthorized");

      // Generate ephemeral token from OpenAI for WebRTC session
      const response = await fetch(
        "https://api.openai.com/v1/realtime/sessions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-realtime-preview-2024-12-17",
            voice: "verse",
            instructions: "Você é um assistente empático e acolhedor focado em saúde mental e bem-estar emocional, chamado Mindflow. Responda sempre em Português do Brasil. Seja gentil, valide os sentimentos do usuário e ofereça suporte sem julgamentos.",
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error("OpenAI Realtime session error:", error);
        throw new Error("Failed to create realtime session");
      }

      const data = await response.json();
      return {
        token: data.client_secret?.value,
        expiresAt: data.client_secret?.expires_at,
      };
    }
  )

  .listen({
    port: 3000,
    hostname: '0.0.0.0'
  });

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
