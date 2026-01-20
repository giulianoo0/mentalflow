import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";

const app = new Elysia()
  .use(
    cors({
      credentials: true,
      origin: "*",
    })
  )
  .get("/", () => "MentalFlow API v1")
  // OpenAI Realtime ephemeral token for WebRTC
  .post("/realtime/token", async ({ headers }) => {
    const token = headers.authorization?.replace("Bearer ", "");
    if (!token) throw new Error("Unauthorized");

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
          instructions:
            "Você é um assistente empático e acolhedor focado em saúde mental e bem-estar emocional, chamado Mindflow. Responda sempre em Português do Brasil. Seja gentil, valide os sentimentos do usuário e ofereça suporte sem julgamentos.",
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
  })
  .listen({
    port: 3000,
    hostname: "0.0.0.0",
  });

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
