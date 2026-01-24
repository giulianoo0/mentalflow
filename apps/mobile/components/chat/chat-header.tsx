import React from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, DrawerActions } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LAYOUT } from "../../constants/layout";
import { GlassIconButton, isGlassAvailable } from "./glass-surface";

interface ChatHeaderProps {
  title: string;
  status?: "online" | "offline" | "typing";
  avatarUrl?: string;
  centerContent?: React.ReactNode;
}

export function ChatHeader({
  title,
  status = "online",
  avatarUrl,
  centerContent,
}: ChatHeaderProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const glassEnabled = isGlassAvailable;
  const iconTone = glassEnabled ? "#0B0B0C" : "#1A1A1A";

  const handleOpenDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  const getStatusText = () => {
    switch (status) {
      case "online":
        return "online";
      case "typing":
        return "digitando...";
      case "offline":
        return "offline";
      default:
        return "";
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "online":
        return "#10B981";
      case "typing":
        return "#FF8800";
      case "offline":
        return "#9CA3AF";
      default:
        return "#9CA3AF";
    }
  };

  return (
    <View style={[styles.outerContainer, { paddingTop: insets.top }]}>
      <View style={styles.container}>
        {/* Menu Button */}
        <GlassIconButton
          onPress={handleOpenDrawer}
          style={styles.menuButton}
          fallbackStyle={styles.menuButtonFallback}
          glassStyle={styles.menuButtonGlass}
          pressedStyle={styles.menuButtonPressed}
        >
          <Ionicons name="menu" size={24} color={iconTone} />
        </GlassIconButton>

        {/* Center Content (Title or Switch) */}
        {centerContent && centerContent}

        {/* Right Placeholder / Avatar */}
        <GlassIconButton
          style={styles.avatarButton}
          fallbackStyle={styles.avatarFallback}
          glassStyle={styles.avatarGlass}
          disabled
        >
          <Ionicons name="person-outline" size={20} color={iconTone} />
        </GlassIconButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuButton: {
    width: LAYOUT.BUTTON_SIZE,
    height: LAYOUT.BUTTON_SIZE,
    borderRadius: LAYOUT.BUTTON_SIZE / 2,
  },
  menuButtonFallback: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  menuButtonGlass: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
    boxShadow: "0 14px 30px rgba(15, 23, 42, 0.16)",
  },
  menuButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  titlePill: {
    flex: 1,
    maxWidth: 200,
    height: LAYOUT.INPUT_HEIGHT,
    borderRadius: LAYOUT.INPUT_HEIGHT / 2,
    overflow: "hidden",
    marginHorizontal: 12,
    backgroundColor: "rgba(255, 255, 255, 0.75)",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  titleContent: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A1A",
    textAlign: "center",
  },
  status: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  avatarButton: {
    width: LAYOUT.BUTTON_SIZE,
    height: LAYOUT.BUTTON_SIZE,
    borderRadius: LAYOUT.BUTTON_SIZE / 2,
  },
  avatarFallback: {
    backgroundColor: "rgba(255, 136, 0, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  avatarGlass: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
    boxShadow: "0 14px 30px rgba(15, 23, 42, 0.16)",
  },
});
