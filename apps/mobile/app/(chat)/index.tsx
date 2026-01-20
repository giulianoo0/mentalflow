import React, { useRef, useEffect, useState, useCallback } from "react";
import { LinearGradient } from "expo-linear-gradient";
import {
  View,
  FlatList,
  StyleSheet,
  Platform,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  Keyboard,
  BackHandler,
} from "react-native";

import MaskedView from "@react-native-masked-view/masked-view";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { useQuery, useMutation, useAction } from "convex/react";
import { nanoid } from "nanoid/non-secure";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../../../packages/fn/convex/_generated/api";

import { ChatHeader } from "@/components/chat/chat-header";
import { ChatInputBar } from "@/components/chat/chat-input-bar";
import { StreamdownRN } from "streamdown-rn";
import { Skeleton } from "@/components/ui/skeleton";
import { useVoiceSession } from "@/hooks/useVoiceSession";

const BlinkingCircle = () => {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600 }),
        withTiming(0.3, { duration: 600 }),
      ),
      -1,
      true,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: "#666",
          marginTop: 8,
        },
        animatedStyle,
      ]}
    />
  );
};

const MessageActions = ({
  text,
  onReload,
  isLast,
  timestamp,
}: {
  text: string;
  onReload?: () => void;
  isLast: boolean;
  timestamp: Date;
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.actionsWrapper}>
      <TouchableOpacity onPress={handleCopy} style={styles.actionButton}>
        <Ionicons
          name={copied ? "checkmark" : "copy-outline"}
          size={14}
          color={copied ? "#4CAF50" : "#999"}
        />
      </TouchableOpacity>
      <Text style={styles.timestamp}>{format(timestamp, "HH:mm")}</Text>
      {isLast && onReload && (
        <TouchableOpacity onPress={onReload} style={styles.actionButton}>
          <Ionicons name="refresh-outline" size={14} color="#999" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const ShimmeringText = () => {
  const shimmerVal = useSharedValue(0);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    shimmerVal.value = withRepeat(
      withTiming(1, { duration: 2500, easing: Easing.linear }),
      -1,
      false,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const translateX = shimmerVal.value * (width + 50) - 50;
    return {
      transform: [{ translateX }],
    };
  });

  return (
    <View
      style={styles.emptyStateContainer}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <MaskedView
          style={{ height: 60, width: width }}
          maskElement={
            <View
              style={{
                flex: 1,
                backgroundColor: "transparent",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text style={styles.emptyStateText}>mentalflow</Text>
            </View>
          }
        >
          <View style={{ flex: 1, backgroundColor: "black" }} />
          <Animated.View
            style={[
              {
                position: "absolute",
                top: 0,
                bottom: 0,
                width: 50,
              },
              animatedStyle,
            ]}
          >
            <LinearGradient
              colors={[
                "transparent",
                "rgba(255, 255, 255, 0.8)",
                "transparent",
              ]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </MaskedView>
      )}
      {width === 0 && (
        <Text style={[styles.emptyStateText, { opacity: 0 }]}>mentalflow</Text>
      )}
    </View>
  );
};

export default function ChatScreen() {
  const [inputText, setInputText] = React.useState("");
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const { height: screenHeight } = useWindowDimensions();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [pendingAssistant, setPendingAssistant] = React.useState<{
    requestId: string;
    createdAt: number;
  } | null>(null);
  const [isSending, setIsSending] = React.useState(false);
  // Track component heights for precise spacing calculations
  const [lastUserMessageHeight, setLastUserMessageHeight] = useState(0);
  const [chatHeaderHeight, setChatHeaderHeight] = useState(90);
  const [inputBarHeight, setInputBarHeight] = useState(80);

  // Get flow id from params
  const paramFlowId = (params.flowId as string) || undefined;
  const [activeFlowId, setActiveFlowId] = useState<string | undefined>(
    undefined,
  );
  const flowNanoId = activeFlowId || paramFlowId;
  const [isCreatingFlow, setIsCreatingFlow] = useState(false);

  // Track param changes to reset local override (activeThreadId) when user navigates
  const prevParamFlowIdRef = useRef(paramFlowId);
  useEffect(() => {
    if (prevParamFlowIdRef.current !== paramFlowId) {
      setActiveFlowId(undefined);
    }
    prevParamFlowIdRef.current = paramFlowId;
  }, [paramFlowId]);

  const prevFlowRef = useRef<string | undefined>(flowNanoId);
  useEffect(() => {
    if (prevFlowRef.current !== flowNanoId) {
      setPendingAssistant(null);
      setIsSending(false);
      setLastUserMessageHeight(0);
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      prevFlowRef.current = flowNanoId;
    }
  }, [flowNanoId]);

  // Load messages from Convex
  const convexMessages = useQuery(
    (api as any).messages.listByFlow,
    flowNanoId ? { flowNanoId } : "skip",
  );

  // Voice session state
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceElapsedTime, setVoiceElapsedTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const createFlow = useMutation((api as any).flows.createFlow);
  const insertMessage = useMutation(
    (api as any).messages.insert,
  ).withOptimisticUpdate((localStore: any, args: any) => {
    if (!args.flowNanoId) return;
    const existing = localStore.getQuery((api as any).messages.listByFlow, {
      flowNanoId: args.flowNanoId,
    });
    if (!existing) return;

    localStore.setQuery(
      (api as any).messages.listByFlow,
      { flowNanoId: args.flowNanoId },
      [
        ...existing,
        {
          _id: `optimistic-${args.nanoId || Date.now()}`,
          _creationTime: Date.now(),
          flowId: "optimistic",
          nanoId: args.nanoId,
          role: args.role,
          content: args.content,
          createdAt: args.createdAt ?? Date.now(),
          isComplete: args.isComplete ?? true,
          dedupeKey: args.dedupeKey,
        },
      ],
    );
  });
  const sendMessageWorkflow = useAction((api as any).chat.sendMessageWorkflow);

  // Voice session hook
  const voiceSession = useVoiceSession({
    flowNanoId,
    onStatusChange: (status) => {
      if (status === "connected" || status === "listening") {
        if (!timerRef.current) {
          timerRef.current = setInterval(() => {
            setVoiceElapsedTime((prev) => prev + 1);
          }, 1000);
        }
      }
      if (status === "disconnected" || status === "error") {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    },
    onError: (error) => {
      console.error("[Voice] Error:", error);
      handleVoiceClose();
    },
  });

  // Voice session handlers
  const handleVoiceStart = useCallback(async () => {
    setIsVoiceActive(true);
    setVoiceElapsedTime(0);
    setIsMuted(false);
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!flowNanoId) {
      setIsCreatingFlow(true);
      try {
        const newFlow = await createFlow({ title: "Nova conversa de voz" });
        setActiveFlowId(newFlow.flowNanoId);
        router.setParams({ flowId: newFlow.flowNanoId });
      } catch (error) {
        console.error("Failed to create thread:", error);
        setIsVoiceActive(false);
        return;
      } finally {
        setIsCreatingFlow(false);
      }
    }

    await voiceSession.startSession();
  }, [voiceSession, flowNanoId, createFlow]);

  const handleVoiceClose = useCallback(() => {
    setIsVoiceActive(false);
    setVoiceElapsedTime(0);
    setIsMuted(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    voiceSession.stopSession();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [voiceSession]);

  const handleVoiceGenerate = useCallback(() => {
    handleVoiceClose();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [handleVoiceClose]);

  const handleVoiceMuteToggle = useCallback(() => {
    setIsMuted((prev) => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Format messages for display
  const messages = React.useMemo(() => {
    const mapped = (convexMessages || []).map((msg: any) => ({
      id: msg._id,
      role: msg.role as "user" | "assistant",
      content:
        msg.chunks && msg.chunks.length > 0
          ? msg.chunks.map((c: any) => c.content).join("")
          : msg.content,
      isComplete: msg.isComplete ?? !(msg.chunks && msg.chunks.length > 0),
      createdAt: new Date(msg.createdAt ?? msg._creationTime),
    }));

    if (pendingAssistant) {
      const hasAssistant = mapped.some(
        (msg: { role: "user" | "assistant"; createdAt: Date }) =>
          msg.role === "assistant" &&
          msg.createdAt.getTime() >= pendingAssistant.createdAt,
      );
      if (!hasAssistant) {
        mapped.push({
          id: `pending-${pendingAssistant.requestId}`,
          role: "assistant",
          content: "",
          isComplete: false,
          createdAt: new Date(pendingAssistant.createdAt),
        });
      }
    }

    return mapped;
  }, [convexMessages, pendingAssistant]);

  React.useEffect(() => {
    if (!pendingAssistant) return;
    const hasAssistant = (convexMessages || []).some(
      (msg: any) =>
        msg.role === "assistant" &&
        new Date(msg.createdAt ?? msg._creationTime).getTime() >=
          pendingAssistant.createdAt,
    );
    if (hasAssistant) {
      setPendingAssistant(null);
    }
  }, [convexMessages, pendingAssistant]);

  React.useEffect(() => {
    if (!pendingAssistant && isSending) {
      setIsSending(false);
    }
  }, [pendingAssistant, isSending]);

  const prevFlowIdRef = useRef<string | undefined>(flowNanoId);
  const flatListRef = useRef<FlatList>(null);

  const [isSwitchingThreads, setIsSwitchingThreads] = React.useState(false);

  useEffect(() => {
    if (
      prevFlowIdRef.current &&
      flowNanoId &&
      prevFlowIdRef.current !== flowNanoId
    ) {
      setIsSwitchingThreads(true);
    }
    prevFlowIdRef.current = flowNanoId;
  }, [flowNanoId]);

  useEffect(() => {
    if (isSwitchingThreads && convexMessages !== undefined) {
      setIsSwitchingThreads(false);
    }
  }, [convexMessages, isSwitchingThreads]);

  useEffect(() => {
    if (!flowNanoId && prevFlowIdRef.current) {
      setInputText("");
      setIsSending(false);
      voiceSession.resetSession();
      setActiveFlowId(undefined);
    }
  }, [flowNanoId]);

  const isStreaming = React.useMemo(() => {
    if (messages.length === 0) return false;

    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        return !messages[i].isComplete;
      }
    }
    return false;
  }, [messages]);

  const isSendLocked = isSending || isStreaming;

  const status = pendingAssistant
    ? "submitted"
    : isStreaming
      ? "streaming"
      : "ready";

  const lastUserMessageIndex = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        return i;
      }
    }
    return -1;
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0) {
      const lastIndex = messages.length - 1;
      const targetIndex =
        status === "submitted" || messages[lastIndex]?.role === "assistant"
          ? lastIndex
          : lastUserMessageIndex;

      if (targetIndex >= 0) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: targetIndex,
            animated: true,
            viewPosition: 0,
          });
        }, 50);
      }
    }
  }, [messages.length, lastUserMessageIndex, status]);

  const reload = async () => {
    console.log("Reload not fully implemented in this architecture yet");
  };

  const wasStreaming = useRef(false);
  useEffect(() => {
    if (status === "streaming" && !wasStreaming.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      wasStreaming.current = true;
    } else if (status === "ready" && wasStreaming.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      wasStreaming.current = false;
    }
  }, [status]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (Keyboard.isVisible()) {
          Keyboard.dismiss();
          return true;
        }
        return false;
      },
    );

    return () => backHandler.remove();
  }, []);

  const handleSend = async () => {
    const trimmedInput = inputText.trim();
    if (!trimmedInput || isSendLocked) return;

    const message = trimmedInput;
    setInputText("");
    setIsSending(true);

    try {
      let activeFlowNanoId = flowNanoId;
      if (!activeFlowNanoId) {
        setIsCreatingFlow(true);
        try {
          const newFlow = await createFlow({});
          activeFlowNanoId = newFlow.flowNanoId;
          setActiveFlowId(activeFlowNanoId);
          router.setParams({ flowId: activeFlowNanoId });
        } finally {
          setIsCreatingFlow(false);
        }
      }

      const requestId = nanoid();
      const userMessageNanoId = nanoid();
      const createdAt = Date.now();

      await insertMessage({
        flowNanoId: activeFlowNanoId,
        nanoId: userMessageNanoId,
        role: "user",
        content: message,
        dedupeKey: `req:${requestId}:user`,
        isComplete: true,
        createdAt,
      });

      setPendingAssistant({ requestId, createdAt });

      await sendMessageWorkflow({
        flowNanoId: activeFlowNanoId,
        content: message,
        requestId,
        userMessageNanoId,
        clientCreatedAt: createdAt,
      });
    } catch (error) {
      console.error("Error sending message:", error);
      setInputText(message);
      setPendingAssistant(null);
      setIsSending(false);
    }
  };

  const renderMessage = ({ item, index }: { item: any; index: number }) => {
    const isUser = item.role === "user";
    const text = item.content || "";

    const isLastMessage = index === messages.length - 1;
    const isLastUserMessage = index === lastUserMessageIndex;
    const isLastAssistantMessage = isLastMessage && !isUser;
    const isMsgStreaming = !item.isComplete && !isUser;

    const topSpacing = 24;
    const assistantContentPadding = 24;
    const prevMessage = messages[index - 1];
    const isAfterAssistant = isUser && prevMessage?.role === "assistant";
    const userTopSpacing = isLastUserMessage
      ? 24
      : isAfterAssistant
        ? 16
        : 0;

    const hasMultipleTurns = messages.length > 2;
    const minAssistantHeight =
      isLastAssistantMessage &&
      hasMultipleTurns &&
      lastUserMessageHeight > 0 &&
      chatHeaderHeight > 0 &&
      inputBarHeight > 0
        ? Math.max(
            0,
            screenHeight -
              chatHeaderHeight -
              inputBarHeight -
              topSpacing -
              lastUserMessageHeight -
              assistantContentPadding,
          ) + 80
        : undefined;

    return (
      <View
        style={[
          styles.messageContainer,
          isUser ? styles.userMessage : styles.assistantMessage,
          userTopSpacing ? { marginTop: userTopSpacing } : {},
          !isUser && minAssistantHeight
            ? { minHeight: minAssistantHeight }
            : {},
        ]}
        onLayout={(event) => {
          if (isLastUserMessage) {
            const { height } = event.nativeEvent.layout;
            setLastUserMessageHeight(height);
          }
        }}
      >
        {isUser ? (
          <Text style={[styles.userText]}>{text}</Text>
        ) : (
          <>
            <View style={styles.assistantBody}>
              {text.length === 0 && isMsgStreaming ? (
                <View style={{ paddingTop: 8 }}>
                  <BlinkingCircle />
                </View>
              ) : (
                <StreamdownRN isComplete={!isMsgStreaming} theme="light">
                  {text}
                </StreamdownRN>
              )}
              {!isMsgStreaming && text.length > 0 && (
                <MessageActions
                  text={text}
                  onReload={reload}
                  isLast={isLastMessage}
                  timestamp={item.createdAt || new Date()}
                />
              )}
            </View>
          </>
        )}
      </View>
    );
  };

  const listContainerStyle = useAnimatedStyle(() => ({
    marginBottom: Math.abs(keyboardHeight.value),
  }));

  const isLoading = isSwitchingThreads && convexMessages === undefined;

  return (
    <LinearGradient
      colors={["#FFF4EB", "#F6F9FF", "#F4F4F4"]}
      locations={[0.24, 0.53, 0.63]}
      style={styles.container}
    >
      <ChatHeader title="mentalflow" />

      <View style={styles.content}>
        <Animated.View style={[styles.listWrapper, listContainerStyle]}>
          <FlatList
            key={flowNanoId || "new-chat"}
            ref={flatListRef}
            data={isLoading ? [1, 2, 3] : messages}
            renderItem={
              isLoading
                ? () => (
                    <View
                      style={[styles.messageContainer, styles.assistantMessage]}
                    >
                      <Skeleton
                        width="70%"
                        height={20}
                        borderRadius={10}
                        style={{ marginBottom: 8 }}
                      />
                      <Skeleton width="40%" height={16} borderRadius={8} />
                    </View>
                  )
                : renderMessage
            }
            keyExtractor={(item, index) =>
              isLoading ? `skeleton-${index}` : item.id || index.toString()
            }
            ListEmptyComponent={!isLoading ? <ShimmeringText /> : null}
            contentContainerStyle={[
              styles.messageList,
              !isLoading && messages.length === 0 && { flex: 1 },
            ]}
            inverted={false}
            showsVerticalScrollIndicator={false}
            onScrollToIndexFailed={(info) => {
              flatListRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: true,
              });
            }}
          />
        </Animated.View>

        <ChatInputBar
          value={inputText}
          onChangeText={setInputText}
          onSend={handleSend}
          onVoicePress={handleVoiceStart}
          isVoiceActive={isVoiceActive}
          voiceElapsedTime={voiceElapsedTime}
          voiceAudioLevel={voiceSession.audioLevel}
          voiceAiAudioLevel={voiceSession.aiAudioLevel}
          voiceIsSpeaking={voiceSession.isSpeaking}
          voiceStatus={voiceSession.status}
          voiceIsMuted={isMuted}
          onVoiceGenerate={handleVoiceGenerate}
          onVoiceMuteToggle={handleVoiceMuteToggle}
          onVoiceClose={handleVoiceClose}
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  listWrapper: {
    flex: 1,
  },
  messageList: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 110,
    paddingBottom: 40,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: -50,
  },
  emptyStateText: {
    fontSize: 32,
    fontWeight: "400",
    color: "#000000",
    letterSpacing: 2,
  },
  messageContainer: {
    marginBottom: 20,
    maxWidth: "100%",
  },
  userMessage: {
    alignSelf: "flex-end",
    backgroundColor: "white",
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  assistantMessage: {
    alignSelf: "flex-start",
    width: "100%",
    marginBottom: 24,
    justifyContent: "flex-start",
  },
  assistantBody: {
    flexGrow: 0,
    flexShrink: 0,
    alignItems: "flex-start",
  },
  userText: {
    fontSize: 16,
    color: "#000000",
  },
  actionsWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    padding: 4,
  },
  timestamp: {
    fontSize: 11,
    color: "#999",
    fontFamily: Platform.OS === "ios" ? "Helvetica" : "sans-serif",
  },
});
