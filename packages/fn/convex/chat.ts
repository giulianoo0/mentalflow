import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { createOpenAI } from "@ai-sdk/openai";
import { smoothStream, stepCountIs, streamText } from "ai";
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
  type WidgetType,
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
      type: z.enum([
        "task",
        "person",
        "event",
        "note",
        "goal",
        "habit",
        "health",
        "water",
      ]),
      title: z.string().min(1),
      description: z.string().nullable(),
      dueDate: z.union([z.number(), z.string()]).nullable(),
      priority: z.enum(["high", "medium", "low"]).nullable(),
      isCompleted: z.boolean().nullable(),
      person: z
        .object({
          role: z.string().nullable(),
          contactInfo: z.string().nullable(),
          avatarUrl: z.string().nullable(),
        })
        .nullable(),
      event: z
        .object({
          startsAt: z.union([z.number(), z.string()]).nullable(),
          endsAt: z.union([z.number(), z.string()]).nullable(),
          location: z.string().nullable(),
        })
        .nullable(),
      habit: z
        .object({
          frequency: z.enum(["daily", "weekly"]).nullable(),
          streak: z.number().nullable(),
        })
        .nullable(),
      health: z
        .object({
          dosage: z.string().nullable(),
          schedule: z.string().nullable(),
          status: z.enum(["active", "paused", "completed"]).nullable(),
        })
        .nullable(),
      water: z
        .object({
          currentAmount: z.number().nullable(),
          targetAmount: z.number().nullable(),
          unit: z.enum(["l", "ml"]).nullable(),
          log: z.record(z.string(), z.number()).nullable(),
        })
        .nullable(),
      goal: z
        .object({
          targetValue: z.number().nullable(),
          progress: z.number().nullable(),
          startValue: z.number().nullable(),
          log: z.record(z.string(), z.number()).nullable(),
        })
        .nullable(),
      relatedTitles: z.array(z.string()).nullable(),
    }),
  ),
  links: z.array(
    z.object({
      fromTitle: z.string().min(1),
      toTitle: z.string().min(1),
      kind: z.enum([
        "mentions",
        "related_to",
        "assigned_to",
        "scheduled_for",
        "depends_on",
        "about",
        "part_of",
        "tracked_by",
        "associated_with",
      ]),
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

    const [messagesRaw, existingWidgets] = await Promise.all([
      ctx.runQuery(api.messages.listByFlow, { flowNanoId }) as Promise<any[]>,
      ctx.runQuery(api.widgets.listByFlow, { flowNanoId }) as Promise<
        WidgetSummary[]
      >,
    ]);

    const messages = messagesRaw.map((message) => ({
      role: message.role as "user" | "assistant",
      content:
        message.chunks && message.chunks.length > 0
          ? message.chunks.map((chunk: any) => chunk.content).join("")
          : message.content,
      reasoningSummary: message.reasoningSummary as string | undefined,
    }));

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

    const assistantReply = await streamAssistantWorker(ctx, {
      assistantMessageId,
      flowId,
      flowNanoId,
      sourceMessageNanoId: userMessageNanoId,
      clientCreatedAt: args.clientCreatedAt,
      messages,
      existingWidgets,
      requestId,
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

export const searchWidgetsTool = action({
  args: {
    flowNanoId: v.string(),
    title: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("task"),
        v.literal("person"),
        v.literal("event"),
        v.literal("note"),
        v.literal("goal"),
        v.literal("habit"),
        v.literal("health"),
        v.literal("water"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const flow = await ctx.runQuery(api.flows.getByNanoId, {
      flowNanoId: args.flowNanoId,
    });
    if (!flow) throw new Error("Flow not found");

    const { widgets } = await runSearchWidgets(ctx, {
      flowNanoId: args.flowNanoId,
      title: args.title ?? null,
      type: (args.type ?? null) as WidgetType | null,
      limit: args.limit ?? null,
    });

    return { widgets };
  },
});

export const upsertWidgetsTool = action({
  args: {
    flowNanoId: v.string(),
    sourceMessageNanoId: v.optional(v.string()),
    widgets: v.optional(v.any()),
    links: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<{ upserts: number; links: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const flow = (await ctx.runQuery(api.flows.getByNanoId, {
      flowNanoId: args.flowNanoId,
    })) as { _id: Id<"flows">; nanoId: string } | null;
    if (!flow) throw new Error("Flow not found");

    const parsed = widgetSchema.parse({
      widgets: coerceWidgetToolInput(args.widgets ?? []),
      links: coerceWidgetLinksInput(args.links ?? []),
    });

    return await runUpsertWidgets(ctx, {
      flowId: flow._id as Id<"flows">,
      flowNanoId: flow.nanoId,
      sourceMessageNanoId: args.sourceMessageNanoId ?? nanoid(),
      extraction: parsed,
    });
  },
});

function coerceWidgetToolInput(input: any[]): WidgetExtraction["widgets"] {
  return (Array.isArray(input) ? input : []).map((widget) => {
    const person = widget?.person ?? null;
    const event = widget?.event ?? null;
    const habit = widget?.habit ?? null;
    const health = widget?.health ?? null;
    const goal = widget?.goal ?? null;
    const water = widget?.water ?? null;
    return {
      type: widget?.type,
      title: widget?.title,
      description: widget?.description ?? null,
      dueDate: coerceDateValue(widget?.dueDate),
      priority: widget?.priority ?? null,
      isCompleted: widget?.isCompleted ?? null,
      person: person
        ? {
            role: person.role ?? null,
            contactInfo: person.contactInfo ?? null,
            avatarUrl: person.avatarUrl ?? null,
          }
        : null,
      event: event
        ? {
            startsAt: coerceDateValue(event.startsAt),
            endsAt: coerceDateValue(event.endsAt),
            location: event.location ?? null,
          }
        : null,
      habit: habit
        ? {
            frequency: habit.frequency ?? null,
            streak: habit.streak ?? null,
          }
        : null,
      health: health
        ? {
            dosage: health.dosage ?? null,
            schedule: health.schedule ?? null,
            status: health.status ?? null,
          }
        : null,
      goal: goal
        ? {
            targetValue: goal.targetValue ?? null,
            progress: goal.progress ?? null,
            startValue: goal.startValue ?? null,
            log: isGoalLog(goal.log) ? goal.log : null,
          }
        : null,
      water: water
        ? {
            currentAmount:
              typeof water.currentAmount === "number"
                ? water.currentAmount
                : null,
            targetAmount:
              typeof water.targetAmount === "number"
                ? water.targetAmount
                : null,
            unit: water.unit === "ml" || water.unit === "l" ? water.unit : null,
            log: isGoalLog(water.log) ? water.log : null,
          }
        : null,
      relatedTitles: Array.isArray(widget?.relatedTitles)
        ? widget.relatedTitles
        : null,
    } as WidgetExtraction["widgets"][number];
  });
}

function coerceWidgetLinksInput(input: any[]): WidgetExtraction["links"] {
  return (Array.isArray(input) ? input : []).map((link) => ({
    fromTitle: link?.fromTitle,
    toTitle: link?.toTitle,
    kind: link?.kind,
  })) as WidgetExtraction["links"];
}

function isGoalLog(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every(
    (entry) => typeof entry === "number",
  );
}

function coerceDateValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function formatTimezoneOffset(offsetMinutes: number) {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (abs % 60).toString().padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function formatLocalIso(date: Date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const offset = formatTimezoneOffset(offsetMinutes);
  const localIso = new Date(date.getTime() + offsetMinutes * 60000)
    .toISOString()
    .replace("Z", offset);
  return { localIso, offset };
}

async function runSearchWidgets(
  ctx: { runQuery: any },
  input: {
    flowNanoId: string;
    title: string | null;
    type: WidgetType | null;
    limit: number | null;
  },
): Promise<{ widgets: WidgetSummary[] }> {
  const results = await ctx.runQuery(api.widgets.searchByFlow, {
    flowNanoId: input.flowNanoId,
    title: input.title ?? undefined,
    type: (input.type ?? undefined) as any,
    limit: input.limit ?? undefined,
  });
  const summary: WidgetSummary[] = results.map((widget: WidgetSummary) => ({
    nanoId: widget.nanoId,
    title: widget.title,
    titleNormalized: widget.titleNormalized,
    type: widget.type,
    fingerprint: widget.fingerprint,
    data: widget.data,
  }));
  return { widgets: summary };
}

async function runUpsertWidgets(
  ctx: { runMutation: any; runQuery: any },
  input: {
    flowId: Id<"flows">;
    flowNanoId: string;
    sourceMessageNanoId: string;
    extraction: WidgetExtraction;
  },
): Promise<{ upserts: number; links: number }> {
  const normalized = normalizeWidgetExtraction(input.extraction);
  const existing = await ctx.runQuery(api.widgets.listByFlow, {
    flowNanoId: input.flowNanoId,
  });
  const plan = resolveWidgetPlan({
    extracted: normalized.widgets,
    links: normalized.links,
    existing,
    sourceMessageNanoId: input.sourceMessageNanoId,
  });
  await ctx.runMutation(api.widgets.applyUpsertPlan, {
    flowId: input.flowId,
    upserts: plan.upserts,
    linkUpserts: plan.linkUpserts,
  });
  return {
    upserts: plan.upserts.length,
    links: plan.linkUpserts.length,
  };
}

async function streamAssistantWorker(
  ctx: { runMutation: any; runQuery: any },
  input: {
    assistantMessageId: Id<"messages">;
    flowId: Id<"flows">;
    flowNanoId: string;
    sourceMessageNanoId: string;
    clientCreatedAt?: number;
    messages: Array<{
      role: "user" | "assistant";
      content: string;
      reasoningSummary?: string;
    }>;
    existingWidgets: WidgetSummary[];
    requestId: string;
  },
) {
  const conversation = input.messages.map((message) => {
    const summary = message.reasoningSummary
      ? `\n\n[Resumo de raciocinio: ${message.reasoningSummary}]`
      : "";
    return {
      role: message.role,
      content: `${message.content}${summary}`.trim(),
    };
  });

  let buffer = "";
  let fullText = "";
  let lastFlush = Date.now();
  const flushIntervalMs = 150;
  const minChunkSize = 12;

  let reasoningBuffer = "";
  let reasoningFull = "";
  let lastReasoningFlush = Date.now();
  const reasoningFlushIntervalMs = 200;
  const reasoningMinChunkSize = 20;
  const toolCalls: Array<{
    name: string;
    args: unknown;
    result: unknown;
    createdAt: number;
    status: "running" | "completed" | "error";
  }> = [];
  const startTime = Date.now();

  const pushToolCallsUpdate = async () => {
    await ctx.runMutation(api.messages.updateToolCalls, {
      messageId: input.assistantMessageId,
      toolCalls,
    });
  };

  const tools = {
    searchWidgets: {
      description:
        "Buscar widgets existentes por titulo ou tipo para evitar duplicatas.",
      inputSchema: z.object({
        title: z.string().nullable(),
        type: z
          .enum([
            "task",
            "person",
            "event",
            "note",
            "goal",
            "habit",
            "health",
            "water",
          ])
          .nullable(),
        limit: z.number().nullable(),
      }),
      execute: async (args: {
        title: string | null;
        type:
          | "task"
          | "person"
          | "event"
          | "note"
          | "goal"
          | "habit"
          | "health"
          | "water"
          | null;
        limit: number | null;
      }) => {
        console.log("[searchWidgets] LLM called with:", JSON.stringify(args));
        const toolCall: (typeof toolCalls)[number] = {
          name: "searchWidgets",
          args,
          result: null,
          status: "running",
          createdAt: Date.now(),
        };
        toolCalls.push(toolCall);
        await pushToolCallsUpdate();

        try {
          const { widgets } = await runSearchWidgets(ctx, {
            flowNanoId: input.flowNanoId,
            title: args.title ?? null,
            type: args.type ?? null,
            limit: args.limit ?? null,
          });
          console.log("[searchWidgets] Found", widgets.length, "widgets");
          toolCall.status = "completed";
          toolCall.result = { count: widgets.length };
          await pushToolCallsUpdate();
          return { widgets };
        } catch (error) {
          toolCall.status = "error";
          toolCall.result = {
            message: error instanceof Error ? error.message : "Erro inesperado",
          };
          await pushToolCallsUpdate();
          throw error;
        }
      },
    },
    upsertWidgets: {
      description:
        "Criar ou atualizar widgets e links com deduplicacao baseada em fingerprint.",
      inputSchema: widgetSchema,
      execute: async (args: WidgetExtraction) => {
        console.log(
          "[upsertWidgets] LLM called with:",
          JSON.stringify({
            widgetCount: args.widgets.length,
            widgets: args.widgets.map((w) => ({
              type: w.type,
              title: w.title,
            })),
            linkCount: args.links.length,
          }),
        );
        const toolCall: (typeof toolCalls)[number] = {
          name: "upsertWidgets",
          args,
          result: null,
          status: "running",
          createdAt: Date.now(),
        };
        toolCalls.push(toolCall);
        await pushToolCallsUpdate();

        try {
          const result = await runUpsertWidgets(ctx, {
            flowId: input.flowId,
            flowNanoId: input.flowNanoId,
            sourceMessageNanoId: input.sourceMessageNanoId,
            extraction: args as WidgetExtraction,
          });
          console.log("[upsertWidgets] Result:", result);
          toolCall.status = "completed";
          toolCall.result = result;
          await pushToolCallsUpdate();
          return result;
        } catch (error) {
          toolCall.status = "error";
          toolCall.result = {
            message: error instanceof Error ? error.message : "Erro inesperado",
          };
          await pushToolCallsUpdate();
          throw error;
        }
      },
    },
    updateWidget: {
      description: "Atualizar um widget existente pelo nanoId.",
      inputSchema: z.object({
        nanoId: z.string(),
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        data: z
          .object({
            dueDate: z.union([z.number(), z.string()]).nullable().optional(),
            priority: z.enum(["high", "medium", "low"]).nullable().optional(),
            isCompleted: z.boolean().nullable().optional(),
            person: z
              .object({
                role: z.string().nullable(),
                contactInfo: z.string().nullable(),
                avatarUrl: z.string().nullable(),
              })
              .nullable()
              .optional(),
            event: z
              .object({
                startsAt: z.union([z.number(), z.string()]).nullable(),
                endsAt: z.union([z.number(), z.string()]).nullable(),
                location: z.string().nullable(),
              })
              .nullable()
              .optional(),
            habit: z
              .object({
                frequency: z.enum(["daily", "weekly"]).nullable(),
                streak: z.number().nullable(),
              })
              .nullable()
              .optional(),
            health: z
              .object({
                dosage: z.string().nullable(),
                schedule: z.string().nullable(),
                status: z.enum(["active", "paused", "completed"]).nullable(),
              })
              .nullable()
              .optional(),
            goal: z
              .object({
                targetValue: z.number().nullable(),
                progress: z.number().nullable(),
                startValue: z.number().nullable(),
                log: z.record(z.string(), z.number()).nullable(),
              })
              .nullable()
              .optional(),
            water: z
              .object({
                currentAmount: z.number().nullable(),
                targetAmount: z.number().nullable(),
                unit: z.enum(["l", "ml"]).nullable(),
                log: z.record(z.string(), z.number()).nullable(),
              })
              .nullable()
              .optional(),
            relatedTitles: z.array(z.string()).nullable().optional(),
          })
          .optional(),
      }),
      execute: async (args: {
        nanoId: string;
        title?: string;
        description?: string | null;
        data?: Record<string, unknown>;
      }) => {
        const toolCall: (typeof toolCalls)[number] = {
          name: "updateWidget",
          args,
          result: null,
          status: "running",
          createdAt: Date.now(),
        };
        toolCalls.push(toolCall);
        await pushToolCallsUpdate();

        try {
          const result = await ctx.runMutation(api.widgets.updateWidget, {
            nanoId: args.nanoId,
            title: args.title,
            description: args.description ?? undefined,
            data: args.data,
          });
          toolCall.status = "completed";
          toolCall.result = result;
          await pushToolCallsUpdate();
          return result;
        } catch (error) {
          toolCall.status = "error";
          toolCall.result = {
            message: error instanceof Error ? error.message : "Erro inesperado",
          };
          await pushToolCallsUpdate();
          throw error;
        }
      },
    },
  };

  const existingSummary = formatWidgetSummary(input.existingWidgets);
  const now = new Date(input.clientCreatedAt ?? Date.now());
  const { localIso, offset } = formatLocalIso(now);
  const timeContext = `Data/hora atual (referencia): ${localIso} (UTC${offset}).`;
  const toolSystemPrompt = `${SYSTEM_PROMPT}

${timeContext}

Sempre que o usuario pedir para salvar, lembrar, registrar ou acompanhar algo, chame upsertWidgets.
Se detectar tarefas, prazos, metas, habitos, saude ou hidratacao implicitos, chame upsertWidgets.
Se houver duvida ou possivel duplicata, use searchWidgets primeiro.
Para salvar datas/horarios nos widgets, use ISO 8601 com offset do fuso do usuario (ex: "2026-01-22T18:00:00-03:00"). O servidor converte para unix ms.
Se o usuario pedir um horario que ja passou hoje, confirme se deseja o proximo dia ou ajuste sugerido.
Quando precisar atualizar um widget existente, use updateWidget com o nanoId (busque antes, se necessario).

TIPOS DE WIDGET (ESTRITO - use exatamente estes):
- task: Qualquer item acionável com prazo ou entrega (ex: "comprar leite", "enviar relatório", "ligar para médico")
- goal: Objetivos de longo prazo com progresso mensurável (ex: "perder 5kg", "economizar R$10mil")
- habit: Ações recorrentes a serem acompanhadas (ex: "meditar diariamente", "beber 2L água", "exercitar")
- health: Medicamentos, suplementos, itens de saúde (ex: "tomar remédio 8h", "vitamina D")
- water: Acompanhamento de hidratação/consumo de água (ex: "beber 2L", "tomei 250ml")
- event: Compromissos com data/hora definida (ex: "reunião quinta 14h", "consulta médico")
- person: Pessoas mencionadas na conversa (ex: "Dr. Silva", "mãe", "terapeuta")
- note: Informações importantes sem ação direta (ex: insight, reflexão, anotação)

REGRAS:
1. Se é acionável com prazo → Task
2. Se é recorrente/hábito → Habit
3. Se é medicação/suplemento → Health
4. Se tem data/hora específica → Event
5. NÃO crie tipos "Insight" - use Note
6. Se for hidratação → Water
7. Use searchWidgets antes de criar duplicatas

CAMPOS ESPECIFICOS:
- habit: frequency ("daily" | "weekly"), streak (numero)
- health: dosage (ex: "500mg"), schedule (ex: "8h e 20h"), status ("active" | "paused" | "completed")
- goal: targetValue, startValue (valor inicial), log (registro diario em {"YYYY-MM-DD": numero}), progress (0-100)
  - Quando o usuario informar valores diários ou progresso, atualize log no dia correto e recalcule progress.
  - progress = round(((startValue + soma(log)) / targetValue) * 100), limite 0-100.
- event: startsAt (ISO 8601), endsAt, location
- water: currentAmount (numero), targetAmount (numero), unit ("l" | "ml"), log (registro diario {"YYYY-MM-DD": numero})
  - Quando o usuario disser que bebeu X, atualize currentAmount e registre no log do dia.

AGRUPAMENTO (LISTAS):
- Quando o usuario listar varias tarefas relacionadas em uma frase, crie UM widget "task" com um titulo de grupo (fornecido pelo usuario ou inferido pelo contexto).
- Coloque cada tarefa individual em relatedTitles (texto curto e acionavel, com verbo). Ex: titulo "Compras" + relatedTitles ["comprar banana", "comprar maçã"].
- CHECKLIST: O widget "task" é o GRUPO. Cada item do checklist é uma tarefa em relatedTitles.
- NAO crie varios widgets "task" quando houver uma lista clara; crie um so com checklist.
- NAO crie widgets "note" ou outros tipos para itens individuais de uma lista de tarefas; tudo deve ficar no checklist do unico widget "task".
- Para varios itens de medicacao/suplementos, crie UM widget "health" e liste cada item em relatedTitles (inclua horario e dosagem quando houver).
- Se houver apenas 1 item, relatedTitles pode ser null e use os campos normais.
- Evite criar varios widgets separados quando houver uma lista clara do usuario.

EXEMPLO DE TODO (FACIL DE PREENCHER):
- Usuario: "Vou ao mercado e vou comprar uva, banana e maca"
- Crie 1 widget task:
  title: "Vou ao mercado"
  relatedTitles: ["Comprar uva", "Comprar banana", "Comprar maca"]

EDICAO DE TODO:
- Se o usuario pedir para adicionar itens a um TODO existente, use searchWidgets para achar o widget pelo titulo e atualize o mesmo widget com relatedTitles novos.
- Preserve relatedTitles atuais e acrescente os novos itens (nao substitua).


Evite duplicatas. Resumo de widgets existentes:
${existingSummary}`;

  let modelReasoning = "";

  try {
    const result = streamText({
      model: openai("gpt-5-mini"),
      system: toolSystemPrompt,
      messages: conversation,
      tools,
      toolChoice: "auto",
      stopWhen: stepCountIs(6),
      providerOptions: {
        openai: {
          reasoningEffort: "minimal",
          reasoningSummary: "auto",
        },
      },
      experimental_transform: smoothStream(),
    });

    for await (const part of result.fullStream) {
      if (part.type === "reasoning-delta") {
        modelReasoning += part.text;
        reasoningBuffer += part.text;
        reasoningFull += part.text;

        const shouldFlushReasoning =
          reasoningBuffer.length >= reasoningMinChunkSize ||
          Date.now() - lastReasoningFlush >= reasoningFlushIntervalMs;

        if (shouldFlushReasoning) {
          await ctx.runMutation(api.messages.createReasoningChunk, {
            messageId: input.assistantMessageId,
            content: reasoningBuffer,
          });
          reasoningBuffer = "";
          lastReasoningFlush = Date.now();
        }
        continue;
      }

      if (part.type !== "text-delta") {
        continue;
      }

      buffer += part.text;
      fullText += part.text;

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

    if (modelReasoning.trim()) {
      modelReasoning = modelReasoning.trim();
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
    if (reasoningBuffer.length > 0) {
      await ctx.runMutation(api.messages.createReasoningChunk, {
        messageId: input.assistantMessageId,
        content: reasoningBuffer,
      });
    }
  }

  const trimmed = fullText.trim();
  const thinkingMs = Date.now() - startTime;
  const toolSummary = summarizeToolCalls(toolCalls);
  const reasoningSummary = mergeReasoningSummary(
    modelReasoning.trim() || reasoningFull.trim(),
    toolSummary,
  );
  await ctx.runMutation(api.messages.updateContent, {
    messageId: input.assistantMessageId,
    content: trimmed,
    isComplete: true,
    toolCalls,
    ...(reasoningSummary && { reasoningSummary }),
    thinkingMs,
    model: "gpt-5-mini",
  });
  return trimmed;
}

function normalizeWidgetExtraction(extraction: WidgetExtraction) {
  const widgets: WidgetInput[] = extraction.widgets.map((widget) => {
    const person = widget.person || {
      role: null,
      contactInfo: null,
      avatarUrl: null,
    };
    const event = widget.event || {
      startsAt: null,
      endsAt: null,
      location: null,
    };
    const habit = widget.habit || {
      frequency: null,
      streak: null,
    };
    const health = widget.health || {
      dosage: null,
      schedule: null,
      status: null,
    };
    const goal = widget.goal || {
      targetValue: null,
      progress: null,
      startValue: null,
      log: null,
    };
    const water = widget.water || {
      currentAmount: null,
      targetAmount: null,
      unit: null,
      log: null,
    };

    const relatedTitles = (widget.relatedTitles ?? [])
      .map((title) => title.trim())
      .filter(Boolean);

    const dueDate = coerceDateValue(widget.dueDate);
    const startsAt = coerceDateValue(event.startsAt);
    const endsAt = coerceDateValue(event.endsAt);

    return {
      type: widget.type,
      title: widget.title,
      description: widget.description ?? undefined,
      dueDate: dueDate ?? undefined,
      priority: widget.priority ?? undefined,
      isCompleted: widget.isCompleted ?? undefined,
      person:
        person.role || person.contactInfo || person.avatarUrl
          ? {
              role: person.role ?? undefined,
              contactInfo: person.contactInfo ?? undefined,
              avatarUrl: person.avatarUrl ?? undefined,
            }
          : undefined,
      event:
        startsAt || endsAt || event.location
          ? {
              startsAt: startsAt ?? undefined,
              endsAt: endsAt ?? undefined,
              location: event.location ?? undefined,
            }
          : undefined,
      habit:
        habit.frequency || habit.streak
          ? {
              frequency: habit.frequency ?? undefined,
              streak: habit.streak ?? undefined,
            }
          : undefined,
      health:
        health.dosage || health.schedule || health.status
          ? {
              dosage: health.dosage ?? undefined,
              schedule: health.schedule ?? undefined,
              status: health.status ?? undefined,
            }
          : undefined,
      goal:
        goal.targetValue || goal.progress || goal.startValue || goal.log
          ? {
              targetValue: goal.targetValue ?? undefined,
              progress: goal.progress ?? undefined,
              startValue: goal.startValue ?? undefined,
              log: goal.log ?? undefined,
            }
          : undefined,
      water:
        water.currentAmount !== null ||
        water.targetAmount !== null ||
        water.unit ||
        water.log
          ? {
              currentAmount: water.currentAmount ?? undefined,
              targetAmount: water.targetAmount ?? undefined,
              unit: water.unit ?? undefined,
              log: water.log ?? undefined,
            }
          : undefined,
      relatedTitles: relatedTitles.length > 0 ? relatedTitles : undefined,
    };
  });

  return {
    widgets,
    links: extraction.links,
  };
}

function summarizeToolCalls(
  toolCalls: Array<{
    name: string;
    result: any;
    createdAt: number;
    status?: "running" | "completed" | "error";
  }>,
) {
  if (toolCalls.length === 0) {
    return "";
  }

  return "";
}

function mergeReasoningSummary(modelSummary: string, toolSummary: string) {
  const sections = [];
  if (modelSummary) sections.push(modelSummary);
  if (toolSummary) sections.push(toolSummary);
  return sections.length > 0 ? sections.join("\n") : "";
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
      if (data?.habit?.frequency)
        details.push(`habitFreq=${data.habit.frequency}`);
      if (data?.habit?.streak) details.push(`streak=${data.habit.streak}`);
      if (data?.health?.dosage) details.push(`dosage=${data.health.dosage}`);
      if (data?.health?.schedule)
        details.push(`schedule=${data.health.schedule}`);
      if (data?.health?.status) details.push(`status=${data.health.status}`);
      if (data?.water?.currentAmount !== undefined)
        details.push(`waterCurrent=${data.water.currentAmount}`);
      if (data?.water?.targetAmount !== undefined)
        details.push(`waterTarget=${data.water.targetAmount}`);
      if (data?.water?.unit) details.push(`waterUnit=${data.water.unit}`);
      if (data?.goal?.targetValue)
        details.push(`target=${data.goal.targetValue}`);
      if (data?.goal?.progress !== undefined)
        details.push(`progress=${data.goal.progress}%`);

      const detailText = details.length ? ` | ${details.join(" ")}` : "";
      return `- ${widget.titleNormalized} | ${widget.type}${detailText}`;
    })
    .join("\n");
}
