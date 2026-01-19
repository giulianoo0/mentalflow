import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalAction, internalMutation, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `Você é um assistente empático e acolhedor focado em saúde mental e bem-estar emocional, chamado Mindflow.
Responda sempre em Português do Brasil.
Seja gentil, valide os sentimentos do usuário e ofereça suporte sem julgamentos.
Se o usuário mencionar risco de suicídio ou auto-mutilação, oriente-o a buscar ajuda profissional imediatamente e forneça os contatos do CVV (188).
Mantenha um tom de conversa natural e amigável.`;
// ============ THREAD MUTATIONS ============

export const createThread = mutation({
    args: {
        title: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        const now = Date.now();
        const threadId = await ctx.db.insert("chatThreads", {
            userId,
            title: args.title ?? "Nova conversa",
            createdAt: now,
            updatedAt: now,
            isActive: true,
            isGenerating: false,
        });
        return threadId;
    },
});

export const updateThread = mutation({
    args: {
        threadId: v.id("chatThreads"),
        title: v.optional(v.string()),
        isActive: v.optional(v.boolean()),
        isGenerating: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== userId) {
            throw new Error("Thread not found");
        }

        await ctx.db.patch(args.threadId, {
            ...(args.title !== undefined && { title: args.title }),
            ...(args.isActive !== undefined && { isActive: args.isActive }),
            ...(args.isGenerating !== undefined && { isGenerating: args.isGenerating }),
            updatedAt: Date.now(),
        });
    },
});

export const deleteThread = mutation({
    args: {
        threadId: v.id("chatThreads"),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== userId) {
            throw new Error("Thread not found");
        }

        // Soft delete: mark as inactive
        await ctx.db.patch(args.threadId, {
            isActive: false,
            updatedAt: Date.now(),
        });
    },
});

// ============ THREAD QUERIES ============

export const listThreads = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return [];

        const threads = await ctx.db
            .query("chatThreads")
            .withIndex("by_user_active", (q) =>
                q.eq("userId", userId).eq("isActive", true)
            )
            .order("desc")
            .collect();

        return threads;
    },
});

export const getThread = query({
    args: {
        threadId: v.id("chatThreads"),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return null;

        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== userId) {
            return null;
        }

        return thread;
    },
});

// ============ MESSAGE MUTATIONS ============

// ============ MESSAGE MUTATIONS & ACTIONS ============

// Internal mutations for secure operations
export const createMessageInternal = internalMutation({
    args: {
        threadId: v.id("chatThreads"),
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
        isComplete: v.boolean(),
    },
    handler: async (ctx, args) => {
        const messageId = await ctx.db.insert("chatMessages", {
            threadId: args.threadId,
            role: args.role,
            content: args.content,
            isComplete: args.isComplete,
            createdAt: Date.now(),
        });

        // Update thread
        await ctx.db.patch(args.threadId, {
            updatedAt: Date.now(),
            isGenerating: !args.isComplete && args.role === "assistant",
        });

        return messageId;
    },
});

export const createMessageChunk = internalMutation({
    args: {
        messageId: v.id("chatMessages"),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("messageChunks", {
            messageId: args.messageId,
            content: args.content,
        });
    },
});

export const markMessageComplete = internalMutation({
    args: {
        messageId: v.id("chatMessages"),
    },
    handler: async (ctx, args) => {
        const message = await ctx.db.get(args.messageId);
        if (!message) return;

        await ctx.db.patch(args.messageId, { isComplete: true });

        // Mark thread as not generating
        await ctx.db.patch(message.threadId, {
            isGenerating: false,
            updatedAt: Date.now()
        });
    },
});

export const startChatMessagePair = action({
    args: {
        threadId: v.optional(v.id("chatThreads")),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        // Create thread if needed
        let threadId = args.threadId;
        if (!threadId) {
            threadId = await ctx.runMutation(api.chat.createThread, {});
        } else {
            // Verify thread ownership
            const thread = await ctx.runQuery(api.chat.getThread, { threadId });
            if (!thread) throw new Error("Thread not found");
        }

        // Create user message
        await ctx.runMutation(internal.chat.createMessageInternal, {
            threadId,
            role: 'user',
            content: args.content,
            isComplete: true,
        });

        // Create empty assistant message
        const assistantMessageId = await ctx.runMutation(internal.chat.createMessageInternal, {
            threadId,
            role: 'assistant',
            content: '',
            isComplete: false,
        });

        // Schedule LLM generation
        await ctx.scheduler.runAfter(0, internal.chat.generateAssistantMessage, {
            threadId,
            assistantMessageId,
        });

        return { threadId, assistantMessageId };
    },
});

export const generateAssistantMessage = internalAction({
    args: {
        threadId: v.id("chatThreads"),
        assistantMessageId: v.id("chatMessages"),
    },
    handler: async (ctx, args) => {
        const messages = await ctx.runQuery(internal.chat.internalGetMessages, { threadId: args.threadId });

        // Helper to reconstruct full content from chunks
        const formatMessages = messages.map(m => ({
            role: m.role,
            content: m.chunks && m.chunks.length > 0
                ? m.chunks.map((c: any) => c.content).join('')
                : m.content
        }));

        const result = streamText({
            model: openai("gpt-4o-mini"),
            system: SYSTEM_PROMPT,
            messages: formatMessages,
        });

        let buffer = "";
        let lastFlushTime = Date.now();
        const FLUSH_INTERVAL = 200; // ms
        const MIN_CHUNK_SIZE = 10; // chars

        try {
            for await (const chunk of result.textStream) {
                buffer += chunk;

                // Flush if buffer is large enough or time interval passed
                if (buffer.length >= MIN_CHUNK_SIZE || Date.now() - lastFlushTime >= FLUSH_INTERVAL) {
                    await ctx.runMutation(internal.chat.createMessageChunk, {
                        messageId: args.assistantMessageId,
                        content: buffer,
                    });
                    buffer = "";
                    lastFlushTime = Date.now();
                }
            }

            // Flush remaining
            if (buffer.length > 0) {
                await ctx.runMutation(internal.chat.createMessageChunk, {
                    messageId: args.assistantMessageId,
                    content: buffer,
                });
            }
        } catch (error) {
            console.error("Error generating assistant message:", error);
            await ctx.runMutation(internal.chat.createMessageChunk, {
                messageId: args.assistantMessageId,
                content: "\n\n[Erro ao gerar resposta. Por favor, tente novamente.]",
            });
        } finally {
            // Mark complete regardless of success/failure
            await ctx.runMutation(internal.chat.markMessageComplete, {
                messageId: args.assistantMessageId,
            });
        }
    },
});

// Obsoleted by createMessageChunk but keeping for backward compat momentarily if needed
export const updateMessageContent = mutation({
    args: {
        messageId: v.id("chatMessages"),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        const message = await ctx.db.get(args.messageId);
        if (!message) throw new Error("Message not found");

        await ctx.db.patch(args.messageId, {
            content: args.content,
        });
    },
});

// Create a chat message from voice transcription
export const createVoiceMessage = mutation({
    args: {
        threadId: v.id("chatThreads"),
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        // Verify thread ownership
        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== userId) {
            throw new Error("Thread not found");
        }

        const messageId = await ctx.db.insert("chatMessages", {
            threadId: args.threadId,
            role: args.role,
            content: args.content,
            isComplete: true,
            createdAt: Date.now(),
        });

        // Update thread timestamp
        await ctx.db.patch(args.threadId, {
            updatedAt: Date.now(),
        });

        return messageId;
    },
});

// Create a placeholder message for voice transcription (to reserve order)
export const createPendingVoiceMessage = mutation({
    args: {
        threadId: v.id("chatThreads"),
        role: v.union(v.literal("user"), v.literal("assistant")),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        // Verify thread ownership
        const thread = await ctx.db.get(args.threadId);
        if (!thread || thread.userId !== userId) {
            throw new Error("Thread not found");
        }

        const messageId = await ctx.db.insert("chatMessages", {
            threadId: args.threadId,
            role: args.role,
            content: "",
            isComplete: false, // Mark as pending
            createdAt: Date.now(),
        });

        // Update thread timestamp
        await ctx.db.patch(args.threadId, {
            updatedAt: Date.now(),
        });

        return messageId;
    },
});

// Update the content of a pending voice message
export const updateVoiceMessageContent = mutation({
    args: {
        messageId: v.id("chatMessages"),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        const message = await ctx.db.get(args.messageId);
        if (!message) throw new Error("Message not found");

        await ctx.db.patch(args.messageId, {
            content: args.content,
            isComplete: true, // Mark as complete
        });
    },
});


// ============ MESSAGE QUERIES ============

// Internal query for LLM generation (bypasses auth check as it's trusted internal call)
export const internalGetMessages = query({
    args: {
        threadId: v.id("chatThreads"),
    },
    handler: async (ctx, args) => {
        const messages = await ctx.db
            .query("chatMessages")
            .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
            .order("asc")
            .collect();

        // Fetch chunks for each message
        return await Promise.all(
            messages.map(async (message) => {
                const chunks = await ctx.db
                    .query("messageChunks")
                    .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
                    .order("asc")
                    .collect();
                return { ...message, chunks };
            })
        );
    },
});

export const getMessages = query({
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

        const messages = await ctx.db
            .query("chatMessages")
            .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
            .order("asc")
            .collect();

        // Fetch chunks for each message
        return await Promise.all(
            messages.map(async (message) => {
                const chunks = await ctx.db
                    .query("messageChunks")
                    .withIndex("by_messageId", (q) => q.eq("messageId", message._id))
                    .order("asc")
                    .collect();
                return { ...message, chunks };
            })
        );
    },
});


