import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { nanoid } from "nanoid";

export const insert = mutation({
  args: {
    flowId: v.optional(v.id("flows")),
    flowNanoId: v.optional(v.string()),
    nanoId: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.optional(v.number()),
    dedupeKey: v.optional(v.string()),
    isComplete: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    let flowId = args.flowId;
    if (!flowId) {
      const flowNanoId = args.flowNanoId;
      if (!flowNanoId) throw new Error("Missing flow identifier");

      const flow = await ctx.db
        .query("flows")
        .withIndex("by_nanoId", (q) => q.eq("nanoId", flowNanoId))
        .first();
      if (!flow || flow.userId !== userId) throw new Error("Flow not found");
      flowId = flow._id;
    }

    const dedupeKey = args.dedupeKey;
    if (!flowId) throw new Error("Missing flow identifier");
    const resolvedFlowId = flowId;

    if (dedupeKey !== undefined) {
      const existingByDedupe = await ctx.db
        .query("messages")
        .withIndex("by_flow_dedupeKey", (q) =>
          q.eq("flowId", resolvedFlowId).eq("dedupeKey", dedupeKey)
        )
        .first();
      if (existingByDedupe) return existingByDedupe;
    }

    const existingNanoId = args.nanoId;
    if (existingNanoId) {
      const existingByNano = await ctx.db
        .query("messages")
        .withIndex("by_flow_nanoId", (q) =>
          q.eq("flowId", resolvedFlowId).eq("nanoId", existingNanoId)
        )
        .first();
      if (existingByNano) return existingByNano;
    }

    const now = Date.now();
    const nanoIdValue = args.nanoId ?? nanoid();
    const messageId = await ctx.db.insert("messages", {
      flowId: resolvedFlowId,
      nanoId: nanoIdValue,
      role: args.role,
      content: args.content,
      createdAt: args.createdAt ?? now,
      dedupeKey: args.dedupeKey,
      isComplete: args.isComplete ?? true,
    });

    await ctx.db.patch(resolvedFlowId, { updatedAt: now });
    return await ctx.db.get(messageId);
  },
});

export const updateContent = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
    isComplete: v.optional(v.boolean()),
    toolCalls: v.optional(
      v.array(
        v.object({
          name: v.string(),
          args: v.any(),
          result: v.any(),
          createdAt: v.number(),
        })
      )
    ),
    reasoningSummary: v.optional(v.string()),
    thinkingMs: v.optional(v.number()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    const flow = await ctx.db.get(message.flowId);
    if (!flow || flow.userId !== userId) throw new Error("Flow not found");

    await ctx.db.patch(args.messageId, {
      content: args.content,
      ...(args.isComplete !== undefined && { isComplete: args.isComplete }),
      ...(args.toolCalls !== undefined && { toolCalls: args.toolCalls }),
      ...(args.reasoningSummary !== undefined && {
        reasoningSummary: args.reasoningSummary,
      }),
      ...(args.thinkingMs !== undefined && { thinkingMs: args.thinkingMs }),
      ...(args.model !== undefined && { model: args.model }),
    });
    await ctx.db.patch(message.flowId, { updatedAt: Date.now() });
  },
});

export const createChunk = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    const flow = await ctx.db.get(message.flowId);
    if (!flow || flow.userId !== userId) throw new Error("Flow not found");

    await ctx.db.insert("messageChunks", {
      messageId: args.messageId,
      content: args.content,
      createdAt: args.createdAt ?? Date.now(),
    });
    await ctx.db.patch(message.flowId, { updatedAt: Date.now() });
  },
});

export const createReasoningChunk = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    const flow = await ctx.db.get(message.flowId);
    if (!flow || flow.userId !== userId) throw new Error("Flow not found");

    await ctx.db.insert("reasoningChunks", {
      messageId: args.messageId,
      content: args.content,
      createdAt: args.createdAt ?? Date.now(),
    });
    await ctx.db.patch(message.flowId, { updatedAt: Date.now() });
  },
});

export const markComplete = mutation({
  args: {
    messageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.messageId);
    if (!message) return;

    const flow = await ctx.db.get(message.flowId);
    if (!flow || flow.userId !== userId) throw new Error("Flow not found");

    await ctx.db.patch(args.messageId, { isComplete: true });
    await ctx.db.patch(message.flowId, { updatedAt: Date.now() });
  },
});

export const createPending = mutation({
  args: {
    flowNanoId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const flow = await ctx.db
      .query("flows")
      .withIndex("by_nanoId", (q) => q.eq("nanoId", args.flowNanoId))
      .first();
    if (!flow || flow.userId !== userId) throw new Error("Flow not found");

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      flowId: flow._id,
      nanoId: nanoid(),
      role: args.role,
      content: "",
      createdAt: now,
      isComplete: false,
    });
    await ctx.db.patch(flow._id, { updatedAt: now });
    return messageId;
  },
});

export const listByFlow = query({
  args: {
    flowNanoId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const flow = await ctx.db
      .query("flows")
      .withIndex("by_nanoId", (q) => q.eq("nanoId", args.flowNanoId))
      .first();
    if (!flow || flow.userId !== userId) return [];

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_flow_createdAt", (q) => q.eq("flowId", flow._id))
      .order("asc")
      .collect();

    return await Promise.all(
      messages.map(async (message) => {
        const chunks = await ctx.db
          .query("messageChunks")
          .withIndex("by_message", (q) => q.eq("messageId", message._id))
          .order("asc")
          .collect();
        const reasoningChunks = await ctx.db
          .query("reasoningChunks")
          .withIndex("by_message", (q) => q.eq("messageId", message._id))
          .order("asc")
          .collect();
        return { ...message, chunks, reasoningChunks };
      })
    );
  },
});
