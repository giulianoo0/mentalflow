import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { StyleSheet, View } from "react-native";
import { Drawer as ExpoDrawer } from "expo-router/drawer";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Drawer } from "react-native-drawer-layout";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAction, useMutation } from "convex/react";
import { nanoid } from "nanoid/non-secure";

import { ChatDrawerContent } from "@/components/chat/drawer-content";
import { WidgetDrawer } from "@/components/chat/widget-drawer";
import { HeaderSwitch, SwitchMode } from "@/components/chat/header-switch";
import { AuthenticatedOnly } from "@/components/auth-wrapper";
import { ChatInputBar } from "@/components/chat/chat-input-bar";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { api } from "../../../../packages/fn/convex/_generated/api";

// Context for drawer control
interface DrawerContextValue {
  openRightDrawer: () => void;
  closeRightDrawer: () => void;
  isRightDrawerOpen: boolean;
  isLeftDrawerOpen: boolean;
  setLeftDrawerOpen: (open: boolean) => void;
  activeFlowNanoId: string | undefined;
  setActiveFlowNanoId: (id: string | undefined) => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

interface ChatRuntimeContextValue {
  pendingAssistant: {
    requestId: string;
    createdAt: number;
  } | null;
  setPendingAssistant: React.Dispatch<
    React.SetStateAction<{
      requestId: string;
      createdAt: number;
    } | null>
  >;
}

const ChatRuntimeContext = createContext<ChatRuntimeContextValue | null>(null);

export const useRightDrawer = () => {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error("useRightDrawer must be used within DrawerProvider");
  }
  return context;
};

export const useDrawerContext = () => {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error("useDrawerContext must be used within DrawerProvider");
  }
  return context;
};

export const useChatRuntime = () => {
  const context = useContext(ChatRuntimeContext);
  if (!context) {
    throw new Error("useChatRuntime must be used within ChatRuntimeProvider");
  }
  return context;
};

// Floating header switch that stays centered during all drawer transitions
function FloatingHeaderSwitch() {
  const insets = useSafeAreaInsets();
  const {
    openRightDrawer,
    closeRightDrawer,
    isRightDrawerOpen,
    isLeftDrawerOpen,
  } = useDrawerContext();

  const [activeMode, setActiveMode] = useState<SwitchMode>("chat");

  // Sync activeMode with drawer states
  useEffect(() => {
    setActiveMode(isRightDrawerOpen ? "drawer" : "chat");
  }, [isRightDrawerOpen]);

  const handleModeChange = (mode: SwitchMode) => {
    setActiveMode(mode);
    if (mode === "drawer") {
      openRightDrawer();
    } else {
      closeRightDrawer();
    }
  };

  // Hide when left drawer is open
  if (isLeftDrawerOpen) {
    return null;
  }

  return (
    <View
      style={[styles.headerSwitchContainer, { paddingTop: insets.top + 16 }]}
      pointerEvents="box-none"
    >
      <HeaderSwitch activeMode={activeMode} onModeChange={handleModeChange} />
    </View>
  );
}

function LeftDrawerNavigator({ searchText }: { searchText: string }) {
  const { setLeftDrawerOpen } = useDrawerContext();

  return (
    <ExpoDrawer
      drawerContent={(props) => (
        <ChatDrawerContent {...props} searchText={searchText} />
      )}
      screenOptions={{
        headerShown: false,
        drawerType: "slide",
        drawerStyle: {
          width: "100%",
          backgroundColor: "transparent",
        },
        overlayColor: "transparent",
        swipeEdgeWidth: 200,
        swipeMinDistance: 5,
      }}
      screenListeners={{
        state: (e) => {
          // Track drawer state from navigation state
          const state = e.data.state;
          if (state) {
            const isOpen = state.history && state.history.length > 1;
            setLeftDrawerOpen(isOpen || false);
          }
        },
      }}
    >
      <ExpoDrawer.Screen
        name="index"
        options={{
          drawerLabel: "Chat",
          title: "Chat",
        }}
      />
    </ExpoDrawer>
  );
}

export default function ChatLayout() {
  const router = useRouter();
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [activeFlowNanoId, setActiveFlowNanoId] = useState<string | undefined>(
    undefined,
  );
  const [chatInputText, setChatInputText] = useState("");
  const [widgetSearchText, setWidgetSearchText] = useState("");
  const [drawerSearchText, setDrawerSearchText] = useState("");
  const [pendingAssistant, setPendingAssistant] = useState<{
    requestId: string;
    createdAt: number;
  } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const params = useLocalSearchParams();
  const paramFlowId = (params.flowId as string) || undefined;

  // Sync activeFlowNanoId with params when they change
  useEffect(() => {
    console.log("[Layout] paramFlowId changed:", paramFlowId);
    if (paramFlowId) {
      setActiveFlowNanoId(paramFlowId);
    } else {
      setActiveFlowNanoId(undefined);
    }
  }, [paramFlowId]);

  // Use the active flow ID, falling back to params
  const currentFlowNanoId = activeFlowNanoId || paramFlowId;
  console.log("[Layout] currentFlowNanoId:", currentFlowNanoId);

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

  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [voiceElapsedTime, setVoiceElapsedTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const voiceSession = useVoiceSession({
    flowNanoId: currentFlowNanoId,
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

  const handleVoiceStart = useCallback(async () => {
    setIsVoiceActive(true);
    setVoiceElapsedTime(0);
    setIsMuted(false);

    if (!currentFlowNanoId) {
      try {
        const newFlow = await createFlow({ title: "Nova conversa de voz" });
        setActiveFlowNanoId(newFlow.flowNanoId);
        router.setParams({ flowId: newFlow.flowNanoId });
      } catch (error) {
        console.error("Failed to create thread:", error);
        setIsVoiceActive(false);
        return;
      }
    }

    await voiceSession.startSession();
  }, [voiceSession, currentFlowNanoId, createFlow, router]);


  const handleVoiceClose = useCallback(() => {
    setIsVoiceActive(false);
    setVoiceElapsedTime(0);
    setIsMuted(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    voiceSession.stopSession();
  }, [voiceSession]);

  const handleNewChat = useCallback(async () => {
    try {
      handleVoiceClose();
      setChatInputText("");
      setWidgetSearchText("");
      setDrawerSearchText("");
      setPendingAssistant(null);
      setIsSending(false);
      const newFlowNanoId = nanoid();
      setActiveFlowNanoId(newFlowNanoId);
      router.replace({ pathname: "/(chat)", params: { flowId: newFlowNanoId } });
      setRightDrawerOpen(false);
      setLeftDrawerOpen(false);
    } catch (error) {
      console.error("Failed to create chat:", error);
    }
  }, [handleVoiceClose, router, setPendingAssistant]);

  const handleVoiceGenerate = useCallback(() => {
    handleVoiceClose();
  }, [handleVoiceClose]);

  const handleVoiceMuteToggle = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (leftDrawerOpen && isVoiceActive) {
      handleVoiceClose();
    }
  }, [leftDrawerOpen, isVoiceActive, handleVoiceClose]);

  const handleSend = useCallback(async () => {
    const trimmedInput = chatInputText.trim();
    if (!trimmedInput || isSending) return;

    const message = trimmedInput;
    setChatInputText("");
    setIsSending(true);

    try {
      let activeFlowId = currentFlowNanoId;
      if (!activeFlowId) {
        const newFlow = await createFlow({});
        activeFlowId = newFlow.flowNanoId;
        setActiveFlowNanoId(activeFlowId);
        router.setParams({ flowId: activeFlowId });
      }

      const requestId = nanoid();
      const userMessageNanoId = nanoid();
      const createdAt = Date.now();

      await insertMessage({
        flowNanoId: activeFlowId,
        nanoId: userMessageNanoId,
        role: "user",
        content: message,
        dedupeKey: `req:${requestId}:user`,
        isComplete: true,
        createdAt,
      });

      setPendingAssistant({ requestId, createdAt });

      await sendMessageWorkflow({
        flowNanoId: activeFlowId,
        content: message,
        requestId,
        userMessageNanoId,
        clientCreatedAt: createdAt,
      });
    } catch (error) {
      console.error("Error sending message:", error);
      setChatInputText(message);
      setPendingAssistant(null);
      setIsSending(false);
    }
  }, [
    chatInputText,
    isSending,
    currentFlowNanoId,
    createFlow,
    insertMessage,
    router,
    sendMessageWorkflow,
  ]);

  useEffect(() => {
    if (!pendingAssistant && isSending) {
      setIsSending(false);
    }
  }, [pendingAssistant, isSending]);

  const drawerValue = useMemo(
    () => ({
      openRightDrawer: () => setRightDrawerOpen(true),
      closeRightDrawer: () => setRightDrawerOpen(false),
      isRightDrawerOpen: rightDrawerOpen,
      isLeftDrawerOpen: leftDrawerOpen,
      setLeftDrawerOpen: setLeftDrawerOpen,
      activeFlowNanoId: currentFlowNanoId,
      setActiveFlowNanoId: (id: string | undefined) => {
        console.log("[Layout] setActiveFlowNanoId called with:", id);
        setActiveFlowNanoId(id);
      },
    }),
    [rightDrawerOpen, leftDrawerOpen, currentFlowNanoId],
  );

  const chatRuntimeValue = useMemo(
    () => ({ pendingAssistant, setPendingAssistant }),
    [pendingAssistant],
  );

  const inputMode = rightDrawerOpen
    ? "widgets"
    : leftDrawerOpen
      ? "drawer"
      : "chat";

  const inputValue =
    inputMode === "widgets"
      ? widgetSearchText
      : inputMode === "drawer"
        ? drawerSearchText
        : chatInputText;

  const inputPlaceholder =
    inputMode === "widgets"
      ? "Buscar widgets..."
      : inputMode === "drawer"
        ? "Buscar conversas..."
        : "Mensagem...";

  const allowSend = inputMode === "chat";
  const primaryAction = inputMode === "drawer" ? "plus" : "voice";

  return (
    <AuthenticatedOnly>
      <GestureHandlerRootView style={styles.container}>
        <DrawerContext.Provider value={drawerValue}>
          <ChatRuntimeContext.Provider value={chatRuntimeValue}>
            <Drawer
              open={rightDrawerOpen}
              onOpen={() => setRightDrawerOpen(true)}
              onClose={() => setRightDrawerOpen(false)}
              drawerPosition="right"
              drawerType="slide"
              drawerStyle={styles.rightDrawer}
              overlayStyle={styles.overlay}
              swipeEdgeWidth={200}
              swipeMinDistance={5}
              renderDrawerContent={() => {
                console.log(
                  "[Layout] Rendering WidgetDrawer with id:",
                  currentFlowNanoId,
                );
                return (
                  <WidgetDrawer
                    flowNanoId={currentFlowNanoId}
                    searchText={widgetSearchText}
                    onClose={() => setRightDrawerOpen(false)}
                  />
                );
              }}
            >
              <LeftDrawerNavigator searchText={drawerSearchText} />
            </Drawer>
            {/* Floating header switch at layout level - stays centered */}
            <FloatingHeaderSwitch />
              <ChatInputBar
                value={inputValue}
                onChangeText={(text) => {
                if (inputMode === "widgets") {
                  setWidgetSearchText(text);
                  return;
                }
                if (inputMode === "drawer") {
                  setDrawerSearchText(text);
                  return;
                }
                setChatInputText(text);
              }}
              onSend={handleSend}
            onVoicePress={
              inputMode === "drawer"
                ? handleNewChat
                : handleVoiceStart
            }
                placeholder={inputPlaceholder}
                allowSend={allowSend}
                primaryAction={primaryAction}
                displayMode={inputMode}
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
          </ChatRuntimeContext.Provider>
        </DrawerContext.Provider>
      </GestureHandlerRootView>
    </AuthenticatedOnly>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSwitchContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 1000,
    elevation: 1000,
  },
  rightDrawer: {
    width: "100%",
    backgroundColor: "transparent",
  },
  overlay: {
    backgroundColor: "transparent",
  },
});
