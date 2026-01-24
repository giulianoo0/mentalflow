import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const schema = defineSchema({
    ...authTables,

    flows: defineTable({
        userId: v.id("users"),
        nanoId: v.string(),
        title: v.optional(v.string()),
        summary: v.optional(v.string()),
        mood: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_user", ["userId", "updatedAt"])
        .index("by_nanoId", ["nanoId"]),

    messages: defineTable({
        flowId: v.id("flows"),
        nanoId: v.string(),
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.string(),
        createdAt: v.number(),
        dedupeKey: v.optional(v.string()),
        isComplete: v.optional(v.boolean()),
        toolCalls: v.optional(
            v.array(
                v.object({
                    name: v.string(),
                    args: v.any(),
                    result: v.any(),
                    createdAt: v.number(),
                    status: v.optional(
                        v.union(
                            v.literal("running"),
                            v.literal("completed"),
                            v.literal("error")
                        )
                    ),
                })
            )
        ),
        reasoningSummary: v.optional(v.string()),
        thinkingMs: v.optional(v.number()),
        model: v.optional(v.string()),
    })
        .index("by_flow_createdAt", ["flowId", "createdAt"])
        .index("by_flow_nanoId", ["flowId", "nanoId"])
        .index("by_flow_dedupeKey", ["flowId", "dedupeKey"]),

    messageChunks: defineTable({
        messageId: v.id("messages"),
        content: v.string(),
        createdAt: v.optional(v.number()),
    })
        .index("by_message", ["messageId", "createdAt"]),

    reasoningChunks: defineTable({
        messageId: v.id("messages"),
        content: v.string(),
        createdAt: v.optional(v.number()),
    })
        .index("by_message", ["messageId", "createdAt"]),

    widgets: defineTable({
        flowId: v.id("flows"),
        nanoId: v.string(),
        type: v.union(
            v.literal("task"),
            v.literal("person"),
            v.literal("event"),
            v.literal("note"),
            v.literal("goal"),
            v.literal("habit"),
            v.literal("health"),
            v.literal("water")
        ),
        title: v.string(),
        description: v.optional(v.string()),
        data: v.any(),
        fingerprint: v.string(),
        titleNormalized: v.string(),
        sourceMessageNanoIds: v.array(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_flow", ["flowId", "updatedAt"])
        .index("by_flow_fingerprint", ["flowId", "fingerprint"])
        .index("by_flow_titleNormalized", ["flowId", "titleNormalized"])
        .index("by_nanoId", ["nanoId"])
        .index("by_type", ["type"]),

    widgetLinks: defineTable({
        flowId: v.id("flows"),
        fromWidgetId: v.id("widgets"),
        toWidgetId: v.id("widgets"),
        kind: v.union(
            v.literal("mentions"),
            v.literal("related_to"),
            v.literal("assigned_to"),
            v.literal("scheduled_for"),
            v.literal("depends_on"),
            v.literal("about"),
            v.literal("part_of"),
            v.literal("tracked_by"),
            v.literal("associated_with")
        ),
        fingerprint: v.string(),
        createdAt: v.number(),
    })
        .index("by_flow", ["flowId", "createdAt"])
        .index("by_flow_fingerprint", ["flowId", "fingerprint"])
        .index("by_flow_from", ["flowId", "fromWidgetId"])
        .index("by_flow_to", ["flowId", "toWidgetId"]),

    voiceTranscriptions: defineTable({
        flowId: v.id("flows"),
        role: v.union(v.literal("user"), v.literal("assistant")),
        text: v.string(),
        audioEventId: v.optional(v.string()),
        createdAt: v.number(),
    })
        .index("by_flow", ["flowId", "createdAt"]),
});

export default schema;
