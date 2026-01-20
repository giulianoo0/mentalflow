import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, smoothStream, streamText } from "ai";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { Id } from "./_generated/dataModel";
import {
  fingerprintLink,
  fingerprintWidget,
  normalizeTitle,
  widgetDataFromInput,
  type LinkKind,
  type LinkUpsert,
  type WidgetInput,
  type WidgetSummary,
  type WidgetUpsert,
} from "./lib/widget_utils";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Você é um assistente empático e acolhedor focado em saúde mental e bem-estar emocional, chamado Mindflow.
Responda sempre em Português do Brasil.
Seja gentil, valide os sentimentos do usuário e ofereça suporte sem julgamentos.
Se o usuário mencionar risco de suicídio ou auto-mutilação, oriente-o a buscar ajuda profissional imediatamente e forneça os contatos do CVV (188).
Mantenha um tom de conversa natural e amigável.`;

const widgetSchema = z.object({
  widgets: z.array(
    z.object({
      type: z.enum(["task", "person", "event", "note"]),
      title: z.string().min(1),
      description: z.string().nullable(),
      dueDate: z.number().nullable(),
      priority: z.enum(["high", "medium", "low"]).nullable(),
      isCompleted: z.boolean().nullable(),
      person: z.object({
        role: z.string().nullable(),
        contactInfo: z.string().nullable(),
      }),
      event: z.object({
        startsAt: z.number().nullable(),
        endsAt: z.number().nullable(),
        location: z.string().nullable(),
      }),
      relatedTitles: z.array(z.string()).nullable(),
    }),
  ),
  links: z.array(
    z.object({
      fromTitle: z.string().min(1),
      toTitle: z.string().min(1),
      kind: z.enum(["mentions", "related", "depends_on"]),
    }),
  ),
});

type WidgetExtraction = z.infer<typeof widgetSchema>;

export const sendMessageWorkflow = action({
  args: {
    flowNanoId: v.optional(v.string()),
    content: v.string(),
    requestId: v.optional(v.string()),
    userMessageNanoId: v.optional(v.string()),
    clientCreatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const requestId = args.requestId ?? nanoid();
    console.log("chat.sendMessageWorkflow:start", {
      requestId,
      flowNanoId: args.flowNanoId,
    });
    const flow = (await ctx.runMutation(api.flows.ensureFlow, {
      flowNanoId: args.flowNanoId,
    })) as { flowId: Id<"flows">; flowNanoId: string };
    const flowId = flow.flowId;
    const flowNanoId = flow.flowNanoId;

    const userMessageNanoId = args.userMessageNanoId ?? nanoid();
    await ctx.runMutation(api.messages.insert, {
      flowId,
      flowNanoId,
      nanoId: userMessageNanoId,
      role: "user",
      content: args.content,
      dedupeKey: `req:${requestId}:user`,
      isComplete: true,
      createdAt: args.clientCreatedAt,
    });

    const [messages, existingWidgets] = await Promise.all([
      ctx.runQuery(api.messages.listByFlow, { flowNanoId }) as Promise<
        Array<{ role: "user" | "assistant"; content: string }>
      >,
      ctx.runQuery(api.widgets.listByFlow, { flowNanoId }) as Promise<
        WidgetSummary[]
      >,
    ]);

    const assistantMessageNanoId = nanoid();
    const assistantMessage = await ctx.runMutation(api.messages.insert, {
      flowId,
      flowNanoId,
      nanoId: assistantMessageNanoId,
      role: "assistant",
      content: "",
      dedupeKey: `req:${requestId}:assistant`,
      isComplete: false,
    });
    if (!assistantMessage?._id) {
      throw new Error("Failed to create assistant message");
    }
    const assistantMessageId = assistantMessage._id as Id<"messages">;

    const [assistantReply, widgetExtraction] = await Promise.all([
      streamAssistantWorker(ctx, {
        assistantMessageId,
        messages,
      }),
      runWidgetWorker(args.content, existingWidgets),
    ]);

    const plan = resolveWidgetPlan({
      extracted: widgetExtraction.widgets,
      links: widgetExtraction.links,
      existing: existingWidgets,
      sourceMessageNanoId: userMessageNanoId,
    });

    await ctx.runMutation(api.widgets.applyUpsertPlan, {
      flowId,
      upserts: plan.upserts,
      linkUpserts: plan.linkUpserts,
    });

    console.log("chat.sendMessageWorkflow:done", {
      requestId,
      flowNanoId,
      assistantMessageNanoId,
    });

    return {
      flowId,
      flowNanoId,
      userMessageNanoId,
      assistantMessageNanoId,
    };
  },
});

async function streamAssistantWorker(
  ctx: { runMutation: any },
  input: {
    assistantMessageId: Id<"messages">;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  },
) {
  const conversation = input.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  let buffer = "";
  let fullText = "";
  let lastFlush = Date.now();
  const flushIntervalMs = 150;
  const minChunkSize = 12;

  try {
    const result = await streamText({
      model: openai("gpt-4o-mini"),
      system: SYSTEM_PROMPT,
      messages: conversation,
      experimental_transform: smoothStream(),
    });

    for await (const chunk of result.textStream) {
      buffer += chunk;
      fullText += chunk;

      const shouldFlush =
        buffer.length >= minChunkSize ||
        Date.now() - lastFlush >= flushIntervalMs;

      if (shouldFlush) {
        await ctx.runMutation(api.messages.createChunk, {
          messageId: input.assistantMessageId,
          content: buffer,
        });
        buffer = "";
        lastFlush = Date.now();
      }
    }
  } catch (error) {
    console.error("chat.streamAssistantWorker:error", error);
    const fallback =
      "\n\n[Erro ao gerar resposta. Por favor, tente novamente.]";
    buffer += fallback;
    fullText += fallback;
  } finally {
    if (buffer.length > 0) {
      await ctx.runMutation(api.messages.createChunk, {
        messageId: input.assistantMessageId,
        content: buffer,
      });
    }
  }

  const trimmed = fullText.trim();
  await ctx.runMutation(api.messages.updateContent, {
    messageId: input.assistantMessageId,
    content: trimmed,
    isComplete: true,
  });
  return trimmed;
}

async function runWidgetWorker(
  content: string,
  existingWidgets: WidgetSummary[],
) {
  const existingSummary = formatWidgetSummary(existingWidgets);
  const prompt = `Extraia widgets e links do texto do usuario.
Evite duplicar widgets ja existentes e prefira enriquecer os atuais quando apropriado.

Texto do usuario:
${content}

Resumo de widgets existentes (titleNormalized | type | campos chave):
${existingSummary}`;

  const result = await generateObject({
    model: openai("gpt-5-mini"),
    schema: widgetSchema,
    prompt,
  });

  return normalizeWidgetExtraction(result.object as WidgetExtraction);
}

function normalizeWidgetExtraction(extraction: WidgetExtraction) {
  const widgets: WidgetInput[] = extraction.widgets.map((widget) => {
    const person = widget.person || { role: null, contactInfo: null };
    const event = widget.event || { startsAt: null, endsAt: null, location: null };

    return {
      type: widget.type,
      title: widget.title,
      description: widget.description ?? undefined,
      dueDate: widget.dueDate ?? undefined,
      priority: widget.priority ?? undefined,
      isCompleted: widget.isCompleted ?? undefined,
      person:
        person.role || person.contactInfo
          ? {
              role: person.role ?? undefined,
              contactInfo: person.contactInfo ?? undefined,
            }
          : undefined,
      event:
        event.startsAt || event.endsAt || event.location
          ? {
              startsAt: event.startsAt ?? undefined,
              endsAt: event.endsAt ?? undefined,
              location: event.location ?? undefined,
            }
          : undefined,
      relatedTitles: widget.relatedTitles ?? undefined,
    };
  });

  return {
    widgets,
    links: extraction.links,
  };
}

function resolveWidgetPlan(input: {
  extracted: WidgetInput[];
  links: Array<{ fromTitle: string; toTitle: string; kind: LinkKind }>;
  existing: WidgetSummary[];
  sourceMessageNanoId: string;
}) {
  const existingByFingerprint = new Map(
    input.existing.map((widget) => [widget.fingerprint, widget]),
  );
  const existingByTypeTitle = new Map(
    input.existing.map((widget) => [
      `${widget.type}:${widget.titleNormalized}`,
      widget,
    ]),
  );
  const titleToFingerprint = new Map(
    input.existing.map((widget) => [
      widget.titleNormalized,
      widget.fingerprint,
    ]),
  );
  const planned = new Map<string, WidgetUpsert>();

  const sortedExtracted = [...input.extracted].sort((a, b) => {
    const aKey = `${a.type}:${normalizeTitle(a.title)}`;
    const bKey = `${b.type}:${normalizeTitle(b.title)}`;
    return aKey.localeCompare(bKey);
  });

  for (const widget of sortedExtracted) {
    const titleNormalized = normalizeTitle(widget.title);
    const extractedFingerprint = fingerprintWidget(widget);
    const existing =
      existingByFingerprint.get(extractedFingerprint) ||
      existingByTypeTitle.get(`${widget.type}:${titleNormalized}`);

    const fingerprint = existing ? existing.fingerprint : extractedFingerprint;
    const upsert = buildUpsert(widget, {
      titleNormalized,
      fingerprint,
      sourceMessageNanoId: input.sourceMessageNanoId,
    });
    planned.set(fingerprint, mergeUpsert(planned.get(fingerprint), upsert));
    if (!titleToFingerprint.has(titleNormalized)) {
      titleToFingerprint.set(titleNormalized, fingerprint);
    }
  }

  const linkUpserts: LinkUpsert[] = [];
  const linkSeen = new Set<string>();

  for (const link of input.links) {
    const fromFingerprint = ensureWidgetForTitle({
      title: link.fromTitle,
      titleNormalized: normalizeTitle(link.fromTitle),
      planned,
      titleToFingerprint,
      sourceMessageNanoId: input.sourceMessageNanoId,
    });
    const toFingerprint = ensureWidgetForTitle({
      title: link.toTitle,
      titleNormalized: normalizeTitle(link.toTitle),
      planned,
      titleToFingerprint,
      sourceMessageNanoId: input.sourceMessageNanoId,
    });

    if (!fromFingerprint || !toFingerprint) continue;

    const fingerprint = fingerprintLink({
      fromFingerprint,
      toFingerprint,
      kind: link.kind,
    });
    if (linkSeen.has(fingerprint)) continue;
    linkSeen.add(fingerprint);
    linkUpserts.push({
      fromFingerprint,
      toFingerprint,
      kind: link.kind,
      fingerprint,
    });
  }

  const upserts = [...planned.values()].sort((a, b) =>
    a.fingerprint.localeCompare(b.fingerprint),
  );

  return { upserts, linkUpserts };
}

function ensureWidgetForTitle(input: {
  title: string;
  titleNormalized: string;
  planned: Map<string, WidgetUpsert>;
  titleToFingerprint: Map<string, string>;
  sourceMessageNanoId: string;
}) {
  const existingFingerprint = input.titleToFingerprint.get(
    input.titleNormalized,
  );
  if (existingFingerprint) return existingFingerprint;

  const placeholder: WidgetInput = {
    type: "note",
    title: input.title,
  };
  const fingerprint = fingerprintWidget(placeholder);
  const upsert = buildUpsert(placeholder, {
    titleNormalized: input.titleNormalized,
    fingerprint,
    sourceMessageNanoId: input.sourceMessageNanoId,
    isPlaceholder: true,
  });
  input.planned.set(
    fingerprint,
    mergeUpsert(input.planned.get(fingerprint), upsert),
  );
  input.titleToFingerprint.set(input.titleNormalized, fingerprint);
  return fingerprint;
}

function buildUpsert(
  widget: WidgetInput,
  options: {
    titleNormalized: string;
    fingerprint: string;
    sourceMessageNanoId: string;
    isPlaceholder?: boolean;
  },
): WidgetUpsert {
  return {
    type: widget.type,
    title: widget.title.trim(),
    description: widget.description?.trim(),
    data: widgetDataFromInput(widget),
    titleNormalized: options.titleNormalized,
    fingerprint: options.fingerprint,
    sourceMessageNanoId: options.sourceMessageNanoId,
    isPlaceholder: options.isPlaceholder,
  };
}

function mergeUpsert(
  existing: WidgetUpsert | undefined,
  incoming: WidgetUpsert,
) {
  if (!existing) return incoming;
  return {
    ...existing,
    title: chooseSpecific(existing.title, incoming.title),
    description: chooseSpecific(existing.description, incoming.description),
    data: mergeData(existing.data, incoming.data),
    sourceMessageNanoId:
      incoming.sourceMessageNanoId || existing.sourceMessageNanoId,
    isPlaceholder: existing.isPlaceholder && incoming.isPlaceholder,
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

function formatWidgetSummary(widgets: WidgetSummary[]) {
  if (widgets.length === 0) {
    return "- (nenhum)";
  }

  return widgets
    .map((widget) => {
      const data = widget.data as Record<string, any>;
      const details = [];
      if (data?.dueDate) details.push(`dueDate=${data.dueDate}`);
      if (data?.priority) details.push(`priority=${data.priority}`);
      if (data?.isCompleted !== undefined)
        details.push(`isCompleted=${data.isCompleted}`);
      if (data?.person?.role) details.push(`personRole=${data.person.role}`);
      if (data?.person?.contactInfo)
        details.push(`personContact=${data.person.contactInfo}`);
      if (data?.event?.startsAt)
        details.push(`eventStart=${data.event.startsAt}`);
      if (data?.event?.location)
        details.push(`eventLocation=${data.event.location}`);

      const detailText = details.length ? ` | ${details.join(" ")}` : "";
      return `- ${widget.titleNormalized} | ${widget.type}${detailText}`;
    })
    .join("\n");
}
