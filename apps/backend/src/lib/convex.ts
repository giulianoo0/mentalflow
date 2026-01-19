import { ConvexHttpClient } from "convex/browser";
import { api } from "fn/convex/_generated/api";
import type { Id } from "fn/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

// Helper to set auth token for authenticated requests
export function withAuth(token: string) {
    convex.setAuth(token);
    return convex;
}

export async function createThread(token: string, title?: string) {
    const client = withAuth(token);
    return await client.mutation(api.chat.createThread, { title });
}

export async function startChatMessagePair(
    token: string,
    threadId: Id<"chatThreads"> | undefined,
    content: string
) {
    const client = withAuth(token);
    return await client.action((api as any).chat.startChatMessagePair, {
        threadId,
        content,
    });
}

export async function updateMessageContent(
    token: string,
    messageId: Id<"chatMessages">,
    content: string
) {
    const client = withAuth(token);
    return await client.mutation(api.chat.updateMessageContent, {
        messageId,
        content,
    });
}

export async function markMessageComplete(
    token: string,
    messageId: Id<"chatMessages">
) {
    const client = withAuth(token);
    return await client.mutation(api.chat.markMessageComplete, {
        messageId,
    });
}

export async function updateThreadTitle(
    token: string,
    threadId: Id<"chatThreads">,
    title: string
) {
    const client = withAuth(token);
    return await client.mutation(api.chat.updateThread, {
        threadId,
        title,
    });
}

export async function updateThreadGenerating(
    token: string,
    threadId: Id<"chatThreads">,
    isGenerating: boolean
) {
    const client = withAuth(token);
    return await client.mutation(api.chat.updateThread, {
        threadId,
        isGenerating,
    });
}

export async function getMessages(
    token: string,
    threadId: Id<"chatThreads">
) {
    const client = withAuth(token);
    return await client.query(api.chat.getMessages, { threadId });
}

export { convex };
