import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { nanoid } from "nanoid";
import { api } from "./_generated/api";

export const ensureFlow = mutation({
  args: {
    flowNanoId: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const now = Date.now();
    const flowNanoIdInput = args.flowNanoId;
    if (flowNanoIdInput) {
      const existing = await ctx.db
        .query("flows")
        .withIndex("by_nanoId", (q) => q.eq("nanoId", flowNanoIdInput))
        .first();

      if (existing) {
        if (existing.userId !== userId) {
          throw new Error("Flow not found");
        }
        await ctx.db.patch(existing._id, { updatedAt: now });
        return { flowId: existing._id, flowNanoId: existing.nanoId };
      }
    }

    const flowNanoId = flowNanoIdInput ?? nanoid();
    const flowId = await ctx.db.insert("flows", {
      userId,
      nanoId: flowNanoId,
      title: args.title,
      createdAt: now,
      updatedAt: now,
    });
    return { flowId, flowNanoId };
  },
});

export const createFlow = mutation({
  args: {
    title: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ flowId: any; flowNanoId: string }> => {
    return await ctx.runMutation(api.flows.ensureFlow, {
      title: args.title,
    });
  },
});

export const listByUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("flows")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const renameFlow = mutation({
  args: {
    flowNanoId: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const flow = await ctx.db
      .query("flows")
      .withIndex("by_nanoId", (q) => q.eq("nanoId", args.flowNanoId))
      .first();

    if (!flow || flow.userId !== userId) {
      throw new Error("Flow not found");
    }

    await ctx.db.patch(flow._id, {
      title: args.title.trim(),
      updatedAt: Date.now(),
    });

    return true;
  },
});

export const deleteFlow = mutation({
  args: {
    flowNanoId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const flow = await ctx.db
      .query("flows")
      .withIndex("by_nanoId", (q) => q.eq("nanoId", args.flowNanoId))
      .first();

    if (!flow || flow.userId !== userId) {
      throw new Error("Flow not found");
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_flow_createdAt", (q) => q.eq("flowId", flow._id))
      .collect();

    for (const message of messages) {
      const chunks = await ctx.db
        .query("messageChunks")
        .withIndex("by_message", (q) => q.eq("messageId", message._id))
        .collect();
      for (const chunk of chunks) {
        await ctx.db.delete(chunk._id);
      }

      const reasoningChunks = await ctx.db
        .query("reasoningChunks")
        .withIndex("by_message", (q) => q.eq("messageId", message._id))
        .collect();
      for (const chunk of reasoningChunks) {
        await ctx.db.delete(chunk._id);
      }

      await ctx.db.delete(message._id);
    }

    const widgets = await ctx.db
      .query("widgets")
      .withIndex("by_flow", (q) => q.eq("flowId", flow._id))
      .collect();
    for (const widget of widgets) {
      await ctx.db.delete(widget._id);
    }

    const widgetLinks = await ctx.db
      .query("widgetLinks")
      .withIndex("by_flow", (q) => q.eq("flowId", flow._id))
      .collect();
    for (const link of widgetLinks) {
      await ctx.db.delete(link._id);
    }

    const transcriptions = await ctx.db
      .query("voiceTranscriptions")
      .withIndex("by_flow", (q) => q.eq("flowId", flow._id))
      .collect();
    for (const transcription of transcriptions) {
      await ctx.db.delete(transcription._id);
    }

    await ctx.db.delete(flow._id);
    return true;
  },
});

export const getByNanoId = query({
  args: {
    flowNanoId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const flow = await ctx.db
      .query("flows")
      .withIndex("by_nanoId", (q) => q.eq("nanoId", args.flowNanoId))
      .first();

    if (!flow || flow.userId !== userId) return null;
    return flow;
  },
});
