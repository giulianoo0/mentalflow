import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const purgeMessageChunks = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const chunks = await ctx.db.query("messageChunks").collect();
    await Promise.all(chunks.map((chunk) => ctx.db.delete(chunk._id)));
    return { deleted: chunks.length };
  },
});
