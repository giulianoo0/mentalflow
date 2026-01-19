import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ============ VOICE TRANSCRIPTION MUTATIONS ============

export const saveTranscription = mutation({
    args: {
        threadId: v.id("chatThreads"),
        role: v.union(v.literal("user"), v.literal("assistant")),
        text: v.string(),
        audioEventId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        // Verify thread ownership
        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== userId) {
            throw new Error("Thread not found");
        }

        const transcriptionId = await ctx.db.insert("voiceTranscriptions", {
            threadId: args.threadId,
            role: args.role,
            text: args.text,
            audioEventId: args.audioEventId,
            createdAt: Date.now(),
        });

        // Update thread timestamp
        await ctx.db.patch(args.threadId, {
            updatedAt: Date.now(),
        });

        return transcriptionId;
    },
});

// ============ VOICE TRANSCRIPTION QUERIES ============

export const getTranscriptions = query({
    args: {
        threadId: v.id("chatThreads"),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return [];

        // Verify thread ownership
        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== userId) {
            return [];
        }

        const transcriptions = await ctx.db
            .query("voiceTranscriptions")
            .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
            .order("asc")
            .collect();

        return transcriptions;
    },
});

export const getLatestTranscriptions = query({
    args: {
        threadId: v.id("chatThreads"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return [];

        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== userId) {
            return [];
        }

        const transcriptions = await ctx.db
            .query("voiceTranscriptions")
            .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
            .order("desc")
            .take(args.limit || 10);

        return transcriptions.reverse(); // Return in chronological order
    },
});
