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
import { useMutation } from 'convex/react';
import { useAuthToken } from "@convex-dev/auth/react";
import { api } from '../../../packages/fn/convex/_generated/api';

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

    const token = useAuthToken();
    const insertMessage = useMutation((api as any).messages.insert);
    const createPendingMessage = useMutation((api as any).messages.createPending);
    const updateMessageContent = useMutation((api as any).messages.updateContent);

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

    const getApiUrl = () => {
        return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    };

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

    const handleRealtimeEvent = useCallback((event: any) => {
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
                updateStatus('listening');
                setAiAudioLevel(0);
                break;
            case 'error':
                console.error('[Voice] Realtime error:', event.error);
                onError?.(new Error(event.error?.message || 'Realtime API error'));
                break;
        }
    }, [currentTranscript, insertMessage, createPendingMessage, updateMessageContent, onTranscription, updateStatus, onError]);

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

            const tokenRes = await fetch(`${getApiUrl()}/realtime/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
            });
            if (!tokenRes.ok) throw new Error('Failed to get ephemeral token');
            if (isAbortedRef.current) return;

            const { token: eToken } = await tokenRes.json();
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
                dc.send(JSON.stringify({ type: 'session.update', session: { input_audio_transcription: { model: 'whisper-1' } } }));
                onOpenTimeoutRef.current = setTimeout(async () => {
                    if (isAbortedRef.current) return;
                    updateStatus('listening');
                    isConnectingRef.current = false;
                    try { recorder.record(); } catch (e) { }
                }, 500);
            };

            dc.onmessage = (e: any) => {
                if (isAbortedRef.current) return;
                try { handleRealtimeEvent(JSON.parse(e.data)); } catch (err) { }
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
    }, [token, recorder, updateStatus, onError, cleanup, handleRealtimeEvent]);

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
    };
}
