import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';

// Get the API URL from environment variables
const API_URL = Constants.expoConfig?.extra?.apiUrl ||
    process.env.EXPO_PUBLIC_API_URL ||
    'http://localhost:3000';

export interface SSEEvent {
    event: 'thread' | 'messageId' | 'text' | 'title' | 'done' | 'error';
    data: string;
}

/**
 * Stream chat response from Elysia backend via SSE
 */
export async function* streamChat(
    token: string,
    message: string,
    threadId?: string
): AsyncGenerator<SSEEvent> {
    const response = await expoFetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ threadId, message }),
    });

    if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
    }

    if (!response.body) {
        throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Parse SSE events from buffer
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            let currentEvent = '';
            let currentData = '';

            for (const line of lines) {
                if (line.startsWith('event:')) {
                    currentEvent = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                    currentData = line.slice(5).trim();
                } else if (line === '' && currentEvent) {
                    // Empty line signals end of event
                    yield {
                        event: currentEvent as SSEEvent['event'],
                        data: currentData,
                    };
                    currentEvent = '';
                    currentData = '';
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

/**
 * Create a new chat thread
 */
export async function createThread(token: string, title?: string): Promise<string> {
    const response = await expoFetch(`${API_URL}/api/chat/threads`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ title }),
    });

    if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();
    return data.threadId;
}

export { API_URL };
