import React, { useRef, useEffect, useState } from "react";
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
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { api } from "../../../../packages/fn/convex/_generated/api";

import { ChatHeader } from "@/components/chat/chat-header";
import { StreamdownRN } from "streamdown-rn";
import { Skeleton } from "@/components/ui/skeleton";
import { useDrawerContext, useChatRuntime } from "./_layout";

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

const ShimmerInline = ({ text }: { text: string }) => {
  const shimmerVal = useSharedValue(0);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    shimmerVal.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.linear }),
      -1,
      false,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const translateX = shimmerVal.value * (width + 60) - 60;
    return { transform: [{ translateX }] };
  });

  return (
    <View
      style={styles.shimmerInlineWrapper}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <MaskedView
          style={{ height: 20, width }}
          maskElement={
            <View style={styles.shimmerMask}>
              <Text style={styles.reasoningLabel}>{text}</Text>
            </View>
          }
        >
          <View style={{ flex: 1, backgroundColor: "#666" }} />
          <Animated.View
            style={[{ position: "absolute", top: 0, bottom: 0, width: 60 }, animatedStyle]}
          >
            <LinearGradient
              colors={["transparent", "rgba(255, 255, 255, 0.9)", "transparent"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </MaskedView>
      )}
      {width === 0 && (
        <Text style={[styles.reasoningLabel, { opacity: 0 }]}>{text}</Text>
      )}
    </View>
  );
};

const ReasoningPanel = ({
  isStreaming,
  reasoningSummary,
  reasoning,
  toolCalls,
  thinkingMs,
}: {
  isStreaming: boolean;
  reasoningSummary?: string;
  reasoning?: string;
  toolCalls?: Array<{
    name: string;
    args: any;
    result: any;
    createdAt: number;
    status?: "running" | "completed" | "error";
  }>;
  thinkingMs?: number;
}) => {
  const [isOpen, setIsOpen] = useState(isStreaming);
  const [elapsed, setElapsed] = useState(1);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (isStreaming) {
      setIsOpen(true);
      if (!startRef.current) {
        startRef.current = Date.now();
        setElapsed(1);
      }
      const timer = setInterval(() => {
        if (startRef.current) {
          const next = Math.max(
            1,
            Math.round((Date.now() - startRef.current) / 1000),
          );
          setElapsed(next);
        }
      }, 500);
      return () => clearInterval(timer);
    }

    startRef.current = null;
    if (thinkingMs) {
      setElapsed(Math.max(1, Math.round(thinkingMs / 1000)));
    }

    const timer = setTimeout(() => setIsOpen(false), 900);
    return () => clearTimeout(timer);
  }, [isStreaming, thinkingMs]);

  const label = isStreaming
    ? `Pensando ${elapsed}s`
    : thinkingMs
      ? `Pensou por ${elapsed}s`
      : "Pensou";

  return (
    <View style={styles.reasoningWrapper}>
      <TouchableOpacity
        onPress={() => setIsOpen((prev) => !prev)}
        style={styles.reasoningTrigger}
        activeOpacity={0.8}
      >
        <Ionicons name="sparkles-outline" size={14} color="#7B7B7B" />
        {isStreaming ? (
          <ShimmerInline text={label} />
        ) : (
          <Text style={styles.reasoningLabel}>{label}</Text>
        )}
        <Ionicons
          name="chevron-down"
          size={14}
          color="#7B7B7B"
          style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}
        />
      </TouchableOpacity>

      {isOpen && (
        <View style={styles.reasoningContent}>
          {reasoning ? (
            <StreamdownRN isComplete={!isStreaming} theme="light">
              {reasoning}
            </StreamdownRN>
          ) : reasoningSummary ? (
            <StreamdownRN isComplete={!isStreaming} theme="light">
              {reasoningSummary}
            </StreamdownRN>
          ) : null}
          {toolCalls && toolCalls.length > 0 ? (
            <View style={styles.toolCallList}>
              {toolCalls.map((call, index) => (
                <View key={`${call.name}-${index}`} style={styles.toolCallRow}>
                  <Text style={styles.toolCallName}>{call.name}</Text>
                  <Text style={styles.toolCallMeta}>
                    {formatToolCall(call)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            !isStreaming && (
              <Text style={styles.toolCallMeta}>Sem ferramentas usadas.</Text>
            )
          )}
        </View>
      )}
    </View>
  );
};

const formatToolCall = (call: {
  name: string;
  result: any;
  status?: "running" | "completed" | "error";
}) => {
  if (call.status === "running") {
    return "em andamento";
  }
  if (call.status === "error") {
    return "falhou";
  }
  return "executado";
};

export default function ChatScreen() {
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const { height: screenHeight } = useWindowDimensions();
  const params = useLocalSearchParams();
  const { setActiveFlowNanoId } = useDrawerContext();
  const { pendingAssistant, setPendingAssistant } = useChatRuntime();
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
  console.log("[ChatScreen] Computed flowNanoId:", flowNanoId);
  // Sync local flow ID with context when it changes
  useEffect(() => {
    setActiveFlowNanoId(flowNanoId);
  }, [flowNanoId, setActiveFlowNanoId]);

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
      reasoningSummary: msg.reasoningSummary as string | undefined,
      reasoning:
        msg.reasoningChunks && msg.reasoningChunks.length > 0
          ? msg.reasoningChunks.map((c: any) => c.content).join("")
          : undefined,
      toolCalls: msg.toolCalls as
        | Array<{
            name: string;
            args: any;
            result: any;
            createdAt: number;
            status?: "running" | "completed" | "error";
          }>
        | undefined,
      thinkingMs: msg.thinkingMs as number | undefined,
      model: msg.model as string | undefined,
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


  const renderMessage = ({ item, index }: { item: any; index: number }) => {
    const isUser = item.role === "user";
    const text = item.content || "";

    const isLastMessage = index === messages.length - 1;
    const isLastUserMessage = index === lastUserMessageIndex;
    const isLastAssistantMessage = isLastMessage && !isUser;
    const isMsgStreaming = !item.isComplete && !isUser;
    const trimmedSummary = item.reasoningSummary?.trim();
    const hasReasoningSummary = Boolean(
      trimmedSummary &&
        trimmedSummary !== "Sem resumo." &&
        trimmedSummary !== "Nenhuma ferramenta usada.",
    );
    const hasReasoning = Boolean(item.reasoning?.trim());
    const hasToolCalls = (item.toolCalls?.length ?? 0) > 0;
    const showReasoningPanel = hasReasoning || hasReasoningSummary || hasToolCalls;

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
              {!isUser && showReasoningPanel ? (
                <ReasoningPanel
                  isStreaming={isMsgStreaming}
                  reasoningSummary={hasReasoningSummary ? item.reasoningSummary : undefined}
                  reasoning={hasReasoning ? item.reasoning : undefined}
                  toolCalls={item.toolCalls}
                  thinkingMs={item.thinkingMs}
                />
              ) : null}
              {text.length === 0 && isMsgStreaming && !item.reasoning ? (
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
    position: "relative",
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
  shimmerInlineWrapper: {
    minWidth: 70,
  },
  shimmerMask: {
    flex: 1,
    justifyContent: "center",
  },
  reasoningWrapper: {
    marginTop: 0,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  reasoningTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reasoningLabel: {
    fontSize: 12,
    color: "#7B7B7B",
    fontWeight: "500",
  },
  reasoningContent: {
    marginTop: 10,
    paddingLeft: 18,
  },
  reasoningText: {
    fontSize: 12,
    color: "#5A5A5A",
    marginBottom: 6,
  },
  toolCallList: {
    gap: 6,
  },
  toolCallRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toolCallName: {
    fontSize: 11,
    fontWeight: "600",
    color: "#5C5C5C",
    textTransform: "uppercase",
  },
  toolCallMeta: {
    fontSize: 11,
    color: "#888",
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
