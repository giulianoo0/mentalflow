import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, DrawerActions } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LAYOUT } from "../../constants/layout";

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
      {/* Progressive Blur Implementation using MaskedView */}
      <View style={styles.blurContainer}>
        <MaskedView
          style={StyleSheet.absoluteFill}
          maskElement={
            <LinearGradient
              colors={["rgba(0,0,0,1)", "rgba(0,0,0,0)"]}
              start={{ x: 0, y: 0.2 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          }
        >
          <BlurView
            intensity={25}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
        </MaskedView>
      </View>

      <View style={styles.container}>
        {/* Menu Button */}
        <Pressable
          style={({ pressed }) => [
            styles.menuButton,
            pressed && styles.menuButtonPressed,
          ]}
          onPress={handleOpenDrawer}
        >
          <Ionicons name="menu" size={24} color="#1A1A1A" />
        </Pressable>

        {/* Center Content (Title or Switch) */}
        {centerContent && centerContent}

        {/* Right Placeholder / Avatar */}
        <View style={[styles.avatarContainer, { opacity: 0 }]}>
          <Text style={styles.avatarEmoji}>👤</Text>
        </View>
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
  blurContainer: {
    ...StyleSheet.absoluteFillObject,
    // Extend blur slightly below content
    bottom: -20,
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
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
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
  avatarContainer: {
    width: LAYOUT.BUTTON_SIZE,
    height: LAYOUT.BUTTON_SIZE,
    borderRadius: LAYOUT.BUTTON_SIZE / 2,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 136, 0, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  avatarEmoji: {
    fontSize: 22,
  },
});
