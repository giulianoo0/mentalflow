import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ============ VOICE TRANSCRIPTION MUTATIONS ============

export const saveTranscription = mutation({
    args: {
        flowId: v.id("flows"),
        role: v.union(v.literal("user"), v.literal("assistant")),
        text: v.string(),
        audioEventId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        // Verify flow ownership
        const flow = await ctx.db.get(args.flowId);
        if (!flow || flow.userId !== userId) {
            throw new Error("Flow not found");
        }

        const transcriptionId = await ctx.db.insert("voiceTranscriptions", {
            flowId: args.flowId,
            role: args.role,
            text: args.text,
            audioEventId: args.audioEventId,
            createdAt: Date.now(),
        });

        // Update flow timestamp
        await ctx.db.patch(args.flowId, {
            updatedAt: Date.now(),
        });

        return transcriptionId;
    },
});

// ============ VOICE TRANSCRIPTION QUERIES ============

export const getTranscriptions = query({
    args: {
        flowId: v.id("flows"),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return [];

        // Verify flow ownership
        const flow = await ctx.db.get(args.flowId);
        if (!flow || flow.userId !== userId) {
            return [];
        }

        const transcriptions = await ctx.db
            .query("voiceTranscriptions")
            .withIndex("by_flow", (q) => q.eq("flowId", args.flowId))
            .order("asc")
            .collect();

        return transcriptions;
    },
});

export const getLatestTranscriptions = query({
    args: {
        flowId: v.id("flows"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return [];

        const flow = await ctx.db.get(args.flowId);
        if (!flow || flow.userId !== userId) {
            return [];
        }

        const transcriptions = await ctx.db
            .query("voiceTranscriptions")
            .withIndex("by_flow", (q) => q.eq("flowId", args.flowId))
            .order("desc")
            .take(args.limit || 10);

        return transcriptions.reverse(); // Return in chronological order
  },
});

export const createRealtimeSessionToken = action({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

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
    },
});
