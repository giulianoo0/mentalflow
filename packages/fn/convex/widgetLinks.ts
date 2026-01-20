import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

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

    return await ctx.db
      .query("widgetLinks")
      .withIndex("by_flow", (q) => q.eq("flowId", flow._id))
      .order("desc")
      .collect();
  },
});
