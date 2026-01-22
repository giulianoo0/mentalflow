import { useState, useRef, useCallback, useEffect } from 'react';
import {
    RTCPeerConnection,
    RTCSessionDescription,
    mediaDevices,
    MediaStream,
    MediaStreamTrack,
} from 'react-native-webrtc';
import {
    getRecordingPermissionsAsync,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    useAudioRecorder,
    useAudioRecorderState,
    RecordingPresets,
} from 'expo-audio';
import { useAction, useMutation } from 'convex/react';
import { api } from '../../../packages/fn/convex/_generated/api';
import { parseDateTimePt } from '../../../packages/utils';

export type VoiceSessionStatus =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'listening'
    | 'processing'
    | 'error'
    | 'disconnected';

interface Transcription {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    isFinal: boolean;
}

interface UseVoiceSessionOptions {
    flowNanoId?: string;
    onTranscription?: (transcription: Transcription) => void;
    onStatusChange?: (status: VoiceSessionStatus) => void;
    onError?: (error: Error) => void;
}

interface WidgetToolSearchArgs {
    title?: string;
    type?: 'task' | 'person' | 'event' | 'note' | 'goal' | 'habit' | 'health';
    limit?: number;
}

interface WidgetToolUpsertArgs {
    widgets: unknown;
    links: unknown;
    sourceMessageNanoId?: string;
}

export function useVoiceSession(options: UseVoiceSessionOptions = {}) {
    const { flowNanoId, onTranscription, onStatusChange, onError } = options;

    const [status, setStatus] = useState<VoiceSessionStatus>('idle');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0); // 0-1 normalized intensity
    const [aiAudioLevel, setAiAudioLevel] = useState(0); // 0-1 normalized AI speech intensity
    const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
    const [currentTranscript, setCurrentTranscript] = useState<string>('');
    const [isMuted, setIsMuted] = useState(false);

    // Expo audio recorder for real-time metering (0-1 normalized level)
    const recorder = useAudioRecorder({
        ...RecordingPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
    });
    const recorderState = useAudioRecorderState(recorder, 50); // High frequency polling (50ms)

    // Sync recorder metering to audioLevel state
    useEffect(() => {
        if (recorderState.isRecording && recorderState.metering !== undefined && recorderState.metering > -100) {
            const db = recorderState.metering;
            const normalized = Math.max(0, (db + 60) / 60);
            setAudioLevel(normalized);
        } else if (isSpeaking && status === 'listening') {
            setAudioLevel(0.4);
        } else {
            setAudioLevel(0);
        }
    }, [recorderState.metering, recorderState.isRecording, status, isSpeaking]);

    const insertMessage = useMutation((api as any).messages.insert);
    const createPendingMessage = useMutation((api as any).messages.createPending);
    const updateMessageContent = useMutation((api as any).messages.updateContent);
    const searchWidgetsToolAction = useAction((api as any).chat.searchWidgetsTool);
    const upsertWidgetsToolAction = useAction((api as any).chat.upsertWidgetsTool);
    const createRealtimeSessionTokenAction = useAction((api as any).voice.createRealtimeSessionToken);

    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const dataChannelRef = useRef<any>(null);
    const audioStreamRef = useRef<MediaStream | null>(null);
    const isConnectingRef = useRef(false);
    const isAbortedRef = useRef(false);
    const onOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flowNanoIdRef = useRef(flowNanoId);
    const pendingUserMessageIdRef = useRef<string | null>(null);

    useEffect(() => {
        flowNanoIdRef.current = flowNanoId;
    }, [flowNanoId]);

    const updateStatus = useCallback((newStatus: VoiceSessionStatus) => {
        setStatus(newStatus);
        onStatusChange?.(newStatus);
    }, [onStatusChange]);

    const cleanup = useCallback(() => {
        isAbortedRef.current = true;
        isConnectingRef.current = false;

        if (onOpenTimeoutRef.current) {
            clearTimeout(onOpenTimeoutRef.current);
            onOpenTimeoutRef.current = null;
        }

        try {
            if (recorderState.isRecording) {
                recorder.stop().catch(console.warn);
            }
        } catch (e) { }

        try {
            if (audioStreamRef.current) {
                audioStreamRef.current.getTracks().forEach(t => {
                    try { t.stop(); } catch (e) { }
                });
                audioStreamRef.current = null;
            }
        } catch (e) { }

        try {
            if (dataChannelRef.current) {
                dataChannelRef.current.close();
                dataChannelRef.current = null;
            }
        } catch (e) { }

        try {
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
                peerConnectionRef.current = null;
            }
        } catch (e) { }
    }, [recorder, recorderState.isRecording]);

    const getDateContext = () => {
        const now = new Date();
        const date = now.toLocaleDateString('pt-BR');
        const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const weekday = now.toLocaleDateString('pt-BR', { weekday: 'long' });
        return `Hoje é ${weekday}, ${date}, e agora são ${time} (horário local).`;
    };

    const executeToolCall = useCallback(async (name: string, args: any) => {
        switch (name) {
            case 'searchWidgetsTool':
                if (!flowNanoIdRef.current) throw new Error('Missing flowNanoId');
                return await searchWidgetsToolAction({
                    flowNanoId: flowNanoIdRef.current,
                    title: args?.title,
                    type: args?.type,
                    limit: args?.limit,
                });
            case 'upsertWidgetsTool':
                if (!flowNanoIdRef.current) throw new Error('Missing flowNanoId');
                return await upsertWidgetsToolAction({
                    flowNanoId: flowNanoIdRef.current,
                    widgets: args?.widgets,
                    links: args?.links,
                    sourceMessageNanoId: args?.sourceMessageNanoId,
                });
            case 'parseDateTimeTool':
                return parseDateTimePt(String(args?.text ?? ''), {
                    baseDateMs: Date.now(),
                    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
                });
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }, [searchWidgetsToolAction, upsertWidgetsToolAction]);

    const handleRealtimeEvent = useCallback(async (event: any) => {
        switch (event.type) {
            case 'conversation.item.input_audio_transcription.completed':
                const userText = event.transcript?.trim();
                // We received the full text for the user message
                if (userText) {
                    const t: Transcription = { id: event.item_id || `u-${Date.now()}`, role: 'user', text: userText, isFinal: true };
                    setTranscriptions(prev => [...prev, t]);
                    onTranscription?.(t);

                    if (flowNanoIdRef.current) {
                        if (pendingUserMessageIdRef.current) {
                            // Update the pending placeholder we created earlier
                            updateMessageContent({ messageId: pendingUserMessageIdRef.current as any, content: userText, isComplete: true }).catch(console.error);
                            pendingUserMessageIdRef.current = null;
                        } else {
                            // Fallback if no placeholder exists (e.g. very short utterance?)
                            insertMessage({ flowNanoId: flowNanoIdRef.current as any, role: 'user', content: userText, isComplete: true }).catch(console.error);
                        }
                    }
                }
                break;
            case 'response.audio_transcript.delta':
                setCurrentTranscript(prev => prev + (event.delta || ''));
                break;
            case 'response.audio_transcript.done':
                const assistantText = event.transcript?.trim() || currentTranscript.trim();
                if (assistantText) {
                    const t: Transcription = { id: event.item_id || `a-${Date.now()}`, role: 'assistant', text: assistantText, isFinal: true };
                    setTranscriptions(prev => [...prev, t]);
                    onTranscription?.(t);
                    setCurrentTranscript('');
                    if (flowNanoIdRef.current) {
                        insertMessage({ flowNanoId: flowNanoIdRef.current as any, role: 'assistant', content: assistantText, isComplete: true }).catch(console.error);
                    }
                }
                break;
            case 'input_audio_buffer.speech_started':
                updateStatus('listening');
                setIsSpeaking(true);
                break;
            case 'input_audio_buffer.speech_stopped':
                setIsSpeaking(false);
                // Create pending message to reserve order in the timeline
                if (flowNanoIdRef.current) {
                    createPendingMessage({ flowNanoId: flowNanoIdRef.current as any, role: 'user' })
                        .then(id => {
                            pendingUserMessageIdRef.current = id;
                        })
                        .catch(console.error);
                }
                break;
            case 'response.created':
                updateStatus('processing');
                setAiAudioLevel(0.3);
                break;
            case 'response.audio.delta':
                setAiAudioLevel(0.8);
                break;
            case 'response.audio.done':
                setAiAudioLevel(0);
                break;
            case 'response.done':
                if (event.response?.output?.length) {
                    for (const output of event.response.output) {
                        if (output.type !== 'function_call') continue;
                        const callId = output.call_id as string | undefined;
                        const toolName = output.name as string | undefined;
                        if (!callId || !toolName) continue;

                        let args: any = {};
                        try {
                            args = output.arguments ? JSON.parse(output.arguments) : {};
                        } catch (err) {
                            args = {};
                        }

                        try {
                            const result = await executeToolCall(toolName, args);
                            dataChannelRef.current?.send(JSON.stringify({
                                type: 'conversation.item.create',
                                item: {
                                    type: 'function_call_output',
                                    call_id: callId,
                                    output: JSON.stringify(result ?? {}),
                                },
                            }));
                            dataChannelRef.current?.send(JSON.stringify({ type: 'response.create' }));
                        } catch (err) {
                            dataChannelRef.current?.send(JSON.stringify({
                                type: 'conversation.item.create',
                                item: {
                                    type: 'function_call_output',
                                    call_id: callId,
                                    output: JSON.stringify({ error: (err as Error)?.message || 'Tool failed' }),
                                },
                            }));
                            dataChannelRef.current?.send(JSON.stringify({ type: 'response.create' }));
                        }
                    }
                }
                updateStatus('listening');
                setAiAudioLevel(0);
                break;
            case 'error':
                console.error('[Voice] Realtime error:', event.error);
                onError?.(new Error(event.error?.message || 'Realtime API error'));
                break;
        }
    }, [currentTranscript, insertMessage, createPendingMessage, updateMessageContent, onTranscription, updateStatus, onError, executeToolCall]);

    const searchWidgets = useCallback(async (input: WidgetToolSearchArgs) => {
        const flowNanoIdValue = flowNanoIdRef.current;
        if (!flowNanoIdValue) throw new Error('Missing flowNanoId');
        return await searchWidgetsToolAction({
            flowNanoId: flowNanoIdValue,
            title: input.title,
            type: input.type,
            limit: input.limit,
        });
    }, [searchWidgetsToolAction]);

    const upsertWidgets = useCallback(async (input: WidgetToolUpsertArgs) => {
        const flowNanoIdValue = flowNanoIdRef.current;
        if (!flowNanoIdValue) throw new Error('Missing flowNanoId');
        return await upsertWidgetsToolAction({
            flowNanoId: flowNanoIdValue,
            widgets: input.widgets,
            links: input.links,
            sourceMessageNanoId: input.sourceMessageNanoId,
        });
    }, [upsertWidgetsToolAction]);

    const startSession = useCallback(async () => {
        if (isConnectingRef.current || (status !== 'idle' && status !== 'disconnected' && status !== 'error')) return;

        try {
            isAbortedRef.current = false;
            isConnectingRef.current = true;
            updateStatus('connecting');

            await setAudioModeAsync({
                allowsRecording: true,
                playsInSilentMode: true,
                interruptionMode: 'doNotMix',
                shouldRouteThroughEarpiece: false,
            });
            if (isAbortedRef.current) return;

            const { status: permStatus } = await getRecordingPermissionsAsync();
            if (permStatus !== 'granted') {
                const res = await requestRecordingPermissionsAsync();
                if (!res.granted) throw new Error('Microphone permission denied');
            }
            if (isAbortedRef.current) return;

            const { token: eToken } = await createRealtimeSessionTokenAction({});
            if (!eToken) throw new Error('Failed to get ephemeral token');
            if (isAbortedRef.current) return;

            const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
            if (isAbortedRef.current) {
                stream.getTracks().forEach(t => t.stop());
                return;
            }
            audioStreamRef.current = stream;

            const pc = new RTCPeerConnection({ iceServers: [] });
            peerConnectionRef.current = pc;

            const track = stream.getAudioTracks()[0];
            if (track) pc.addTrack(track, stream);

            const dc = pc.createDataChannel('oai-events') as any;
            dataChannelRef.current = dc;

            dc.onopen = () => {
                if (isAbortedRef.current) return;
                updateStatus('connected');
                dc.send(JSON.stringify({
                    type: 'session.update',
                    session: {
                        input_audio_transcription: { model: 'whisper-1' },
                        instructions:
                            'Você é um assistente empático e acolhedor focado em saúde mental e bem-estar emocional, chamado Mindflow. Responda sempre em Português do Brasil. ' +
                            `${getDateContext()} ` +
                            'Sempre que o usuário pedir para salvar, lembrar, registrar ou acompanhar tarefas, eventos, metas, hábitos, saúde ou notas, use as ferramentas. ' +
                            'IMPORTANTE: Em listas de tarefas (ex: compras), crie UM widget task com title de grupo e relatedTitles como checklist. Nao crie varios widgets para cada item. Nao crie notes para itens individuais; tudo vai no checklist. ' +
                            'Quando o usuario mencionar data/hora em linguagem natural, use parseDateTimeTool para converter para timestamp em ms antes de preencher startsAt/endsAt/dueDate. ' +
                            'Use searchWidgetsTool para encontrar itens existentes e evitar duplicatas; use upsertWidgetsTool para criar ou atualizar widgets e links. ' +
                            'Se houver dúvida sobre duplicatas, faça uma busca primeiro.',
                        tools: [
                            {
                                type: 'function',
                                name: 'searchWidgetsTool',
                                description: 'Buscar widgets existentes por título ou tipo para evitar duplicatas.',
                                parameters: {
                                    type: 'object',
                                    properties: {
                                        title: { type: 'string', nullable: true },
                                        type: {
                                            type: 'string',
                                            enum: ['task', 'person', 'event', 'note', 'goal', 'habit', 'health'],
                                            nullable: true,
                                        },
                                        limit: { type: 'number', nullable: true },
                                    },
                                    required: [],
                                },
                            },
                            {
                                type: 'function',
                                name: 'parseDateTimeTool',
                                description: 'Converter data/hora em PT-BR para timestamp (ms) em UTC usando o fuso do usuario.',
                                parameters: {
                                    type: 'object',
                                    properties: {
                                        text: { type: 'string' },
                                        baseDateMs: { type: 'number', nullable: true },
                                        timezoneOffsetMinutes: { type: 'number', nullable: true },
                                    },
                                    required: ['text'],
                                },
                            },
                            {
                                type: 'function',
                                name: 'upsertWidgetsTool',
                                description: 'Criar ou atualizar widgets e links com deduplicação por fingerprint.',
                                parameters: {
                                    type: 'object',
                                    properties: {
                                        widgets: {
                                            type: 'array',
                                            minItems: 1,
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    type: {
                                                        type: 'string',
                                                        enum: ['task', 'person', 'event', 'note', 'goal', 'habit', 'health'],
                                                    },
                                                    title: { type: 'string' },
                                                    description: { type: 'string', nullable: true },
                                                    dueDate: { type: 'number', nullable: true },
                                                    priority: { type: 'string', enum: ['high', 'medium', 'low'], nullable: true },
                                                    isCompleted: { type: 'boolean', nullable: true },
                                                    person: {
                                                        type: 'object',
                                                        nullable: true,
                                                        properties: {
                                                            role: { type: 'string', nullable: true },
                                                            contactInfo: { type: 'string', nullable: true },
                                                            avatarUrl: { type: 'string', nullable: true },
                                                        },
                                                    },
                                                    event: {
                                                        type: 'object',
                                                        nullable: true,
                                                        properties: {
                                                            startsAt: { type: 'number', nullable: true },
                                                            endsAt: { type: 'number', nullable: true },
                                                            location: { type: 'string', nullable: true },
                                                        },
                                                    },
                                                    habit: {
                                                        type: 'object',
                                                        nullable: true,
                                                        properties: {
                                                            frequency: { type: 'string', enum: ['daily', 'weekly'], nullable: true },
                                                            streak: { type: 'number', nullable: true },
                                                        },
                                                    },
                                                    health: {
                                                        type: 'object',
                                                        nullable: true,
                                                        properties: {
                                                            dosage: { type: 'string', nullable: true },
                                                            schedule: { type: 'string', nullable: true },
                                                            status: { type: 'string', enum: ['active', 'paused', 'completed'], nullable: true },
                                                        },
                                                    },
                                                    goal: {
                                                        type: 'object',
                                                        nullable: true,
                                                        properties: {
                                                            targetValue: { type: 'number', nullable: true },
                                                            progress: { type: 'number', nullable: true },
                                                        },
                                                    },
                                                    relatedTitles: {
                                                        type: 'array',
                                                        nullable: true,
                                                        items: { type: 'string' },
                                                    },
                                                },
                                                required: ['type', 'title'],
                                            },
                                        },
                                        links: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    fromTitle: { type: 'string' },
                                                    toTitle: { type: 'string' },
                                                    kind: {
                                                        type: 'string',
                                                        enum: ['mentions', 'related_to', 'assigned_to', 'scheduled_for', 'depends_on', 'about', 'part_of', 'tracked_by', 'associated_with'],
                                                    },
                                                },
                                                required: ['fromTitle', 'toTitle', 'kind'],
                                            },
                                        },
                                        sourceMessageNanoId: { type: 'string', nullable: true },
                                    },
                                    required: ['widgets', 'links'],
                                },
                            },
                        ],
                        tool_choice: 'auto',
                    },
                }));
                onOpenTimeoutRef.current = setTimeout(async () => {
                    if (isAbortedRef.current) return;
                    updateStatus('listening');
                    isConnectingRef.current = false;
                    try { recorder.record(); } catch (e) { }
                }, 500);
            };

            dc.onmessage = (e: any) => {
                if (isAbortedRef.current) return;
                try { void handleRealtimeEvent(JSON.parse(e.data)); } catch (err) { }
            };

            dc.onerror = (e: any) => {
                if (isAbortedRef.current) return;
                onError?.(new Error('Data channel error'));
            };

            const offer = await pc.createOffer({ offerToReceiveAudio: true });
            if (isAbortedRef.current) return;
            await pc.setLocalDescription(offer);
            if (isAbortedRef.current) return;

            const sdpRes = await fetch('https://api.openai.com/v1/realtime?model=gpt-realtime-mini', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${eToken}`, 'Content-Type': 'application/sdp' },
                body: offer.sdp,
            });
            if (!sdpRes.ok) throw new Error('SDP failed');
            if (isAbortedRef.current) return;

            const sdp = await sdpRes.text();
            if (isAbortedRef.current) return;
            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));

        } catch (e) {
            console.error('[Voice] start failed:', e);
            if (!isAbortedRef.current) {
                cleanup();
                onError?.(e instanceof Error ? e : new Error('Start failed'));
            }
        }
    }, [createRealtimeSessionTokenAction, recorder, updateStatus, onError, cleanup, handleRealtimeEvent, status]);

    const stopSession = useCallback(() => {
        cleanup();
        updateStatus('disconnected');
    }, [cleanup, updateStatus]);

    const resetSession = useCallback(() => {
        stopSession();
        setTranscriptions([]);
        setCurrentTranscript('');
        updateStatus('idle');
    }, [stopSession, updateStatus]);

    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    return {
        status,
        isSpeaking,
        audioLevel,
        aiAudioLevel,
        transcriptions,
        currentTranscript,
        isMuted,
        startSession,
        stopSession,
        resetSession,
        searchWidgets,
        upsertWidgets,
    };
}
