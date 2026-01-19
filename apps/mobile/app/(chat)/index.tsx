import React, { useRef, useEffect, useState, useCallback } from "react";
import { LinearGradient } from "expo-linear-gradient";
import {
  View,
  FlatList,
  StyleSheet,
  Platform,
  TouchableOpacity,
  useWindowDimensions,
  Keyboard,
  BackHandler,
} from "react-native";

import MaskedView from "@react-native-masked-view/masked-view";
import { fetch as expoFetch } from "expo/fetch";
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
import { useQuery, useMutation } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../../../../packages/fn/convex/_generated/api";

import { ChatHeader } from "@/components/chat/chat-header";
import { ChatInputBar } from "@/components/chat/chat-input-bar";
import { StreamdownRN } from "streamdown-rn";
import { Text } from "react-native";
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
  const token = useAuthToken();
  // Track component heights for precise spacing calculations
  const [lastUserMessageHeight, setLastUserMessageHeight] = useState(0);
  const [chatHeaderHeight, setChatHeaderHeight] = useState(90);
  const [inputBarHeight, setInputBarHeight] = useState(80);

  // Get threadId from params
  const paramThreadId = (params.threadId as string) || undefined;
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>(
    undefined,
  );
  const threadId = activeThreadId || paramThreadId;
  const [isCreatingThread, setIsCreatingThread] = useState(false);

  // Track param changes to reset local override (activeThreadId) when user navigates
  const prevParamThreadIdRef = useRef(paramThreadId);
  useEffect(() => {
    if (prevParamThreadIdRef.current !== paramThreadId) {
      setActiveThreadId(undefined);
    }
    prevParamThreadIdRef.current = paramThreadId;
  }, [paramThreadId]);

  // Load messages from Convex
  const convexMessages = useQuery(
    (api as any).chat.getMessages,
    threadId ? { threadId: threadId as any } : "skip",
  );

  const getApiUrl = () => {
    return process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
  };

  const [pendingMessage, setPendingMessage] = React.useState<string | null>(
    null,
  );
  const [optimisticTimestamp, setOptimisticTimestamp] = React.useState<
    number | null
  >(null);

  // Voice session state
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceElapsedTime, setVoiceElapsedTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const createThread = useMutation((api as any).chat.createThread);

  // Voice session hook
  const voiceSession = useVoiceSession({
    threadId,
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

    if (!threadId) {
      setIsCreatingThread(true);
      try {
        const newThreadId = await createThread({
          title: "Nova conversa de voz",
        });
        setActiveThreadId(newThreadId);
        router.setParams({ threadId: newThreadId });
      } catch (error) {
        console.error("Failed to create thread:", error);
        setIsVoiceActive(false);
        return;
      } finally {
        setIsCreatingThread(false);
      }
    }

    await voiceSession.startSession();
  }, [voiceSession, threadId, createThread]);

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
    const msgs = (convexMessages || []).map((msg: any) => ({
      id: msg._id,
      role: msg.role as "user" | "assistant",
      content:
        msg.chunks && msg.chunks.length > 0
          ? msg.chunks.map((c: any) => c.content).join("")
          : msg.content,
      isComplete: msg.isComplete,
      createdAt: new Date(msg._creationTime),
    }));

    if (pendingMessage) {
      const alreadyExists = msgs.some(
        (msg: any) =>
          msg.role === "user" && msg.content.trim() === pendingMessage.trim(),
      );

      if (!alreadyExists) {
        msgs.push({
          id: `optimistic-${optimisticTimestamp || Date.now()}`,
          role: "user",
          content: pendingMessage,
          isComplete: true,
          createdAt: new Date(),
        });
      } else {
        setPendingMessage(null);
        setOptimisticTimestamp(null);
      }
    }

    if (msgs.length === 0) return [];
    return msgs;
  }, [convexMessages, pendingMessage, optimisticTimestamp]);

  // Clear pending message once it appears in the real list
  React.useEffect(() => {
    if (!pendingMessage || !convexMessages || convexMessages.length === 0)
      return;

    const recentMessages = convexMessages.slice(-3);
    const foundMatch = recentMessages.some((msg: any) => {
      if (msg.role !== "user") return false;

      const content =
        msg.chunks && msg.chunks.length > 0
          ? msg.chunks.map((c: any) => c.content).join("")
          : msg.content;

      return content.trim() === pendingMessage.trim();
    });

    if (foundMatch) {
      setPendingMessage(null);
      setOptimisticTimestamp(null);
    }
  }, [convexMessages, pendingMessage]);

  const [isSending, setIsSending] = React.useState(false);
  const prevThreadIdRef = useRef<string | undefined>(threadId);
  const flatListRef = useRef<FlatList>(null);

  const [isSwitchingThreads, setIsSwitchingThreads] = React.useState(false);

  useEffect(() => {
    if (
      prevThreadIdRef.current &&
      threadId &&
      prevThreadIdRef.current !== threadId
    ) {
      setIsSwitchingThreads(true);
    }
    prevThreadIdRef.current = threadId;
  }, [threadId]);

  useEffect(() => {
    if (isSwitchingThreads && convexMessages !== undefined) {
      setIsSwitchingThreads(false);
    }
  }, [convexMessages, isSwitchingThreads]);

  useEffect(() => {
    if (!threadId && prevThreadIdRef.current) {
      setInputText("");
      setPendingMessage(null);
      setOptimisticTimestamp(null);
      setIsSending(false);
      voiceSession.resetSession();
      setActiveThreadId(undefined);
    }
  }, [threadId]);

  const isStreaming = React.useMemo(() => {
    if (messages.length === 0) return false;

    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        return !messages[i].isComplete;
      }
    }
    return false;
  }, [messages]);

  const status = isSending ? "submitted" : isStreaming ? "streaming" : "ready";

  const lastUserMessageIndex = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        return i;
      }
    }
    return -1;
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0 && lastUserMessageIndex >= 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: lastUserMessageIndex,
          animated: true,
          viewPosition: 0,
        });
      }, 300);
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
    if (!trimmedInput || isSending) return;

    const message = trimmedInput;
    setInputText("");
    setPendingMessage(message);
    setIsSending(true);

    try {
      const response = await expoFetch(`${getApiUrl()}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          threadId,
          message,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.threadId && !threadId) {
          router.setParams({ threadId: data.threadId });
        }
      } else {
        console.error("Failed to send message", response.status);
        setInputText(message);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setInputText(message);
    } finally {
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

    const topPadding = 72;
    const userMessageBottomMargin = 12;
    const assistantContentPadding = 24;

    const dynamicHeight =
      isLastAssistantMessage &&
      lastUserMessageHeight > 0 &&
      chatHeaderHeight > 0 &&
      inputBarHeight > 0
        ? Math.max(
            100,
            screenHeight -
              chatHeaderHeight -
              inputBarHeight -
              topPadding -
              lastUserMessageHeight -
              userMessageBottomMargin -
              assistantContentPadding,
          )
        : undefined;

    return (
      <View
        style={[
          styles.messageContainer,
          isUser ? styles.userMessage : styles.assistantMessage,
          isLastUserMessage ? { marginTop: 24 } : {},
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
            <StreamdownRN isComplete={!isMsgStreaming} theme="light">
              {text}
            </StreamdownRN>
            {!isMsgStreaming && text.length > 0 && (
              <MessageActions
                text={text}
                onReload={reload}
                isLast={isLastMessage}
                timestamp={item.createdAt || new Date()}
              />
            )}
            {isLastAssistantMessage && dynamicHeight && dynamicHeight > 0 && (
              <View style={{ height: dynamicHeight }} />
            )}
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
            ListEmptyComponent={!isLoading ? ShimmeringText : null}
            contentContainerStyle={[
              styles.messageList,
              !isLoading && messages.length === 0 && { flex: 1 },
            ]}
            inverted={false}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={() => (
              <View style={{ paddingBottom: 20 }}>
                {status === "submitted" && !isStreaming && (
                  <View style={[styles.assistantMessage, { marginTop: 12 }]}>
                    <BlinkingCircle />
                  </View>
                )}
              </View>
            )}
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
