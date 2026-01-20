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
  handler: async (ctx, args) => {
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
