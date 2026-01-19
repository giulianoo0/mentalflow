import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
} from "react";
import { StyleSheet, View } from "react-native";
import { Drawer as ExpoDrawer } from "expo-router/drawer";
import { Drawer } from "react-native-drawer-layout";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatDrawerContent } from "@/components/chat/drawer-content";
import { WidgetDrawer } from "@/components/chat/widget-drawer";
import { HeaderSwitch, SwitchMode } from "@/components/chat/header-switch";
import { AuthenticatedOnly } from "@/components/auth-wrapper";

// Context for drawer control
interface DrawerContextValue {
  openRightDrawer: () => void;
  closeRightDrawer: () => void;
  isRightDrawerOpen: boolean;
  isLeftDrawerOpen: boolean;
  setLeftDrawerOpen: (open: boolean) => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

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

function LeftDrawerNavigator() {
  const { setLeftDrawerOpen } = useDrawerContext();

  return (
    <ExpoDrawer
      drawerContent={(props) => <ChatDrawerContent {...props} />}
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
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);

  const drawerValue = useMemo(
    () => ({
      openRightDrawer: () => setRightDrawerOpen(true),
      closeRightDrawer: () => setRightDrawerOpen(false),
      isRightDrawerOpen: rightDrawerOpen,
      isLeftDrawerOpen: leftDrawerOpen,
      setLeftDrawerOpen: setLeftDrawerOpen,
    }),
    [rightDrawerOpen, leftDrawerOpen],
  );

  return (
    <AuthenticatedOnly>
      <GestureHandlerRootView style={styles.container}>
        <DrawerContext.Provider value={drawerValue}>
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
            renderDrawerContent={() => (
              <WidgetDrawer
                threadId={undefined}
                onClose={() => setRightDrawerOpen(false)}
              />
            )}
          >
            <LeftDrawerNavigator />
          </Drawer>
          {/* Floating header switch at layout level - stays centered */}
          <FloatingHeaderSwitch />
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
