import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const schema = defineSchema({
    ...authTables,

    // Chat threads table
    chatThreads: defineTable({
        userId: v.id("users"),
        title: v.string(),
        createdAt: v.number(),
        updatedAt: v.number(),
        isActive: v.boolean(),
        isGenerating: v.optional(v.boolean()),
    })
        .index("by_user", ["userId", "updatedAt"])
        .index("by_user_active", ["userId", "isActive", "updatedAt"]),

    // Chat messages table
    chatMessages: defineTable({
        threadId: v.id("chatThreads"),
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
        isComplete: v.optional(v.boolean()),
        isStreaming: v.optional(v.boolean()), // Deprecated, keeping for legacy
        createdAt: v.number(),
    })
        .index("by_thread", ["threadId", "createdAt"]),

    // Message chunks for streaming - stored incrementally
    messageChunks: defineTable({
        messageId: v.id("chatMessages"),
        content: v.string(),
    })
        .index("by_messageId", ["messageId"]),

    // Voice transcriptions from OpenAI Realtime API
    voiceTranscriptions: defineTable({
        threadId: v.id("chatThreads"),
        role: v.union(v.literal("user"), v.literal("assistant")),
        text: v.string(),
        audioEventId: v.optional(v.string()), // OpenAI event ID for tracking
        createdAt: v.number(),
    })
        .index("by_thread", ["threadId", "createdAt"]),
});

export default schema;
