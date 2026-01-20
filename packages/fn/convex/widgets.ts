import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { nanoid } from "nanoid";
import {
  fingerprintLink,
  fingerprintWidget,
  normalizeTitle,
  widgetDataFromInput,
  type LinkUpsert,
  type WidgetInput,
  type WidgetType,
  type WidgetUpsert,
} from "./lib/widget_utils";

const widgetTypeValues: WidgetType[] = ["task", "person", "event", "note"];

export const listByFlow = query({
  args: {
    flowNanoId: v.string(),
    type: v.optional(
      v.union(
        v.literal("task"),
        v.literal("person"),
        v.literal("event"),
        v.literal("note"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const flow = await ctx.db
      .query("flows")
      .withIndex("by_nanoId", (q) => q.eq("nanoId", args.flowNanoId))
      .first();
    if (!flow || flow.userId !== userId) return [];

    const widgetType = args.type;
    if (widgetType) {
      return await ctx.db
        .query("widgets")
        .withIndex("by_type", (q) => q.eq("type", widgetType))
        .filter((q) => q.eq(q.field("flowId"), flow._id))
        .order("desc")
        .collect();
    }

    return await ctx.db
      .query("widgets")
      .withIndex("by_flow", (q) => q.eq("flowId", flow._id))
      .order("desc")
      .collect();
  },
});

export const findByFlowAndTitleNormalized = query({
  args: {
    flowNanoId: v.string(),
    titleNormalized: v.string(),
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
      .query("widgets")
      .withIndex("by_flow_titleNormalized", (q) =>
        q.eq("flowId", flow._id).eq("titleNormalized", args.titleNormalized),
      )
      .collect();
  },
});

export const applyUpsertPlan = mutation({
  args: {
    flowId: v.id("flows"),
    upserts: v.array(
      v.object({
        type: v.union(
          v.literal("task"),
          v.literal("person"),
          v.literal("event"),
          v.literal("note"),
        ),
        title: v.string(),
        description: v.optional(v.string()),
        data: v.any(),
        titleNormalized: v.string(),
        fingerprint: v.string(),
        sourceMessageNanoId: v.optional(v.string()),
        isPlaceholder: v.optional(v.boolean()),
      }),
    ),
    linkUpserts: v.array(
      v.object({
        fromFingerprint: v.string(),
        toFingerprint: v.string(),
        kind: v.union(
          v.literal("mentions"),
          v.literal("related"),
          v.literal("depends_on"),
        ),
        fingerprint: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const fingerprintToId = new Map<string, string>();

    const sortedUpserts = [...args.upserts].sort((a, b) =>
      a.fingerprint.localeCompare(b.fingerprint),
    );

    for (const upsert of sortedUpserts) {
      if (!widgetTypeValues.includes(upsert.type)) {
        continue;
      }

      const widgetInput: WidgetInput = {
        type: upsert.type,
        title: upsert.title,
        description: upsert.description,
        dueDate: upsert.data?.dueDate as number | undefined,
        priority: upsert.data?.priority as
          | "high"
          | "medium"
          | "low"
          | undefined,
        isCompleted: upsert.data?.isCompleted as boolean | undefined,
        person: upsert.data?.person as WidgetInput["person"],
        event: upsert.data?.event as WidgetInput["event"],
        relatedTitles: upsert.data?.relatedTitles as string[] | undefined,
      };

      const canonicalFingerprint = fingerprintWidget(widgetInput);
      const titleNormalized = normalizeTitle(widgetInput.title);

      const lookupFingerprint = upsert.fingerprint || canonicalFingerprint;
      const existing = await ctx.db
        .query("widgets")
        .withIndex("by_flow_fingerprint", (q) =>
          q.eq("flowId", args.flowId).eq("fingerprint", lookupFingerprint),
        )
        .first();

      const nextData = widgetDataFromInput(widgetInput);
      if (existing) {
        const merged = mergeWidget(existing, {
          title: widgetInput.title,
          description: widgetInput.description,
          data: nextData,
          titleNormalized,
          sourceMessageNanoId: upsert.sourceMessageNanoId,
        });

        await ctx.db.patch(existing._id, {
          title: merged.title,
          description: merged.description,
          data: merged.data,
          titleNormalized: merged.titleNormalized,
          sourceMessageNanoIds: merged.sourceMessageNanoIds,
          updatedAt: now,
        });
        fingerprintToId.set(lookupFingerprint, existing._id);
      } else {
        const widgetId = await ctx.db.insert("widgets", {
          flowId: args.flowId,
          nanoId: nanoid(),
          type: widgetInput.type,
          title: widgetInput.title,
          description: widgetInput.description,
          data: nextData,
          fingerprint: canonicalFingerprint,
          titleNormalized,
          sourceMessageNanoIds: upsert.sourceMessageNanoId
            ? [upsert.sourceMessageNanoId]
            : [],
          createdAt: now,
          updatedAt: now,
        });
        fingerprintToId.set(canonicalFingerprint, widgetId);
      }
    }

    const sortedLinks = [...args.linkUpserts].sort((a, b) =>
      a.fingerprint.localeCompare(b.fingerprint),
    );

    for (const link of sortedLinks) {
      const linkFingerprint = fingerprintLink({
        fromFingerprint: link.fromFingerprint,
        toFingerprint: link.toFingerprint,
        kind: link.kind,
      });

      const existingLink = await ctx.db
        .query("widgetLinks")
        .withIndex("by_flow_fingerprint", (q) =>
          q.eq("flowId", args.flowId).eq("fingerprint", linkFingerprint),
        )
        .first();
      if (existingLink) continue;

      const fromWidgetId = await resolveWidgetId(
        ctx,
        args.flowId,
        link.fromFingerprint,
        fingerprintToId,
      );
      const toWidgetId = await resolveWidgetId(
        ctx,
        args.flowId,
        link.toFingerprint,
        fingerprintToId,
      );

      if (!fromWidgetId || !toWidgetId) continue;

      await ctx.db.insert("widgetLinks", {
        flowId: args.flowId,
        fromWidgetId,
        toWidgetId,
        kind: link.kind,
        fingerprint: linkFingerprint,
        createdAt: now,
      });
    }

    await ctx.db.patch(args.flowId, { updatedAt: now });
    return { updatedAt: now };
  },
});

function mergeWidget(
  existing: {
    title: string;
    description?: string;
    data: Record<string, unknown>;
    titleNormalized: string;
    sourceMessageNanoIds: string[];
  },
  incoming: {
    title: string;
    description?: string;
    data: Record<string, unknown>;
    titleNormalized: string;
    sourceMessageNanoId?: string;
  },
) {
  const nextTitle = chooseSpecific(existing.title, incoming.title);
  const nextDescription = chooseSpecific(
    existing.description,
    incoming.description,
  );
  const nextData = mergeData(existing.data, incoming.data);
  const nextTitleNormalized =
    incoming.titleNormalized || existing.titleNormalized;
  const nextSources = [...existing.sourceMessageNanoIds];
  if (
    incoming.sourceMessageNanoId &&
    !nextSources.includes(incoming.sourceMessageNanoId)
  ) {
    nextSources.push(incoming.sourceMessageNanoId);
  }

  return {
    title: nextTitle,
    description: nextDescription,
    data: nextData,
    titleNormalized: nextTitleNormalized,
    sourceMessageNanoIds: nextSources,
  };
}

function chooseSpecific(existing?: string, incoming?: string) {
  const incomingValue = incoming?.trim();
  const existingValue = existing?.trim();
  if (!incomingValue) return existingValue || "";
  if (!existingValue) return incomingValue;
  if (incomingValue.length > existingValue.length) return incomingValue;
  return existingValue;
}

function mergeData(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
) {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    const existingValue = merged[key];
    if (
      existingValue === undefined ||
      existingValue === null ||
      existingValue === ""
    ) {
      merged[key] = value;
      continue;
    }

    if (
      Array.isArray(existingValue) &&
      Array.isArray(value) &&
      existingValue.length === 0 &&
      value.length > 0
    ) {
      merged[key] = value;
    }
  }
  return merged;
}

async function resolveWidgetId(
  ctx: { db: any },
  flowId: string,
  fingerprint: string,
  cache: Map<string, string>,
) {
  const cached = cache.get(fingerprint);
  if (cached) return cached;

  const widget = await ctx.db
    .query("widgets")
    .withIndex("by_flow_fingerprint", (q: any) =>
      q.eq("flowId", flowId).eq("fingerprint", fingerprint),
    )
    .first();
  if (widget) {
    cache.set(fingerprint, widget._id);
    return widget._id;
  }
  return null;
}
