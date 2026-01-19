import React, { useEffect } from "react";
import { StyleSheet, View, Text, Pressable, Platform } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

export type SwitchMode = "chat" | "drawer";

interface HeaderSwitchProps {
  activeMode: SwitchMode;
  onModeChange: (mode: SwitchMode) => void;
  externalPosition?: ReturnType<typeof useSharedValue<number>>; // -1 = left drawer, 0 = chat, 1 = right drawer
}

const SWITCH_WIDTH = 130;
const SWITCH_HEIGHT = 44;
const PADDING = 4;
const TAB_WIDTH = (SWITCH_WIDTH - PADDING * 2) / 2;

// easeOutQuint: cubic-bezier(0.22, 1, 0.36, 1)
const easeOutQuint = Easing.bezier(0.22, 1, 0.36, 1);

export function HeaderSwitch({
  activeMode,
  onModeChange,
  externalPosition,
}: HeaderSwitchProps) {
  const internalPosition = useSharedValue(activeMode === "chat" ? 0 : 1);
  // For external position, we need to map -1..1 range to 0..1 range for the switch
  // Only care about 0 (chat) and 1 (right drawer), ignore -1 (left drawer)
  const position = externalPosition || internalPosition;
  const startPosition = useSharedValue(0);
  const isGesturing = useSharedValue(false);

  // Sync internal position with prop changes (only when not using external control)
  useEffect(() => {
    if (!externalPosition && !isGesturing.value) {
      internalPosition.value = withTiming(activeMode === "chat" ? 0 : 1, {
        duration: 400,
        easing: easeOutQuint,
      });
    }
  }, [activeMode, externalPosition]);

  // If using external position, when it crosses threshold, update mode
  useEffect(() => {
    if (externalPosition) {
      // We rely on parent to call onModeChange
      return;
    }
  }, [externalPosition]);

  const pan = Gesture.Pan()
    .onStart(() => {
      isGesturing.value = true;
      startPosition.value = position.value;
    })
    .onUpdate((event) => {
      // Directly follow finger - no animation
      const progressDelta = event.translationX / TAB_WIDTH;
      let newPos = startPosition.value + progressDelta;

      // Clamp between 0 and 1
      if (newPos < 0) newPos = 0;
      if (newPos > 1) newPos = 1;

      position.value = newPos;
    })
    .onEnd(() => {
      isGesturing.value = false;
      const target = position.value > 0.5 ? 1 : 0;
      position.value = withTiming(target, {
        duration: 400,
        easing: easeOutQuint,
      });

      const newMode = target === 0 ? "chat" : "drawer";
      if (newMode !== activeMode) {
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
        runOnJS(onModeChange)(newMode);
      }
    });

  const indicatorStyle = useAnimatedStyle(() => {
    // Map position: if using externalPosition (-1 to 1), clamp to 0-1 range
    // -1 (left drawer) -> 0 (chat position in switch)
    //  0 (chat) -> 0 (chat position in switch)
    //  1 (right drawer) -> 1 (drawer position in switch)
    const switchPosition = externalPosition
      ? Math.max(0, position.value) // Clamp negative values to 0
      : position.value;

    return {
      transform: [
        {
          translateX: switchPosition * TAB_WIDTH,
        },
      ],
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.container}>
        {/* Background Track */}
        <View style={styles.track} />

        {/* Sliding Indicator */}
        <Animated.View style={[styles.indicator, indicatorStyle]} />

        {/* Icons Layer - ZIndex higher to receive taps if needed, but GestureDetector wraps all */}
        <View style={styles.iconsContainer}>
          <Pressable
            style={styles.tab}
            onPress={() => onModeChange("chat")}
            hitSlop={8}
          >
            {/* We use Animated style to interpolate color if we want, but for now specific requirement is just sliding.
                            Let's use a trick: standard icons. */}
            <Ionicons
              name="chatbubbles"
              size={20}
              color={activeMode === "chat" ? "#000" : "#666"}
            />
          </Pressable>

          <Pressable
            style={styles.tab}
            onPress={() => onModeChange("drawer")}
            hitSlop={8}
          >
            <Ionicons
              // Using a generic icon for "drawer/widget" concept as per request for "C" like logo in image or just drawer
              name="grid"
              size={20}
              color={activeMode === "drawer" ? "#000" : "#666"}
            />
          </Pressable>
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SWITCH_WIDTH,
    height: SWITCH_HEIGHT,
    borderRadius: SWITCH_HEIGHT / 2,
    backgroundColor: "rgba(230, 230, 235, 0.5)", // Subtle gray track
    padding: PADDING,
    position: "relative",
    justifyContent: "center",
  },
  track: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: SWITCH_HEIGHT / 2,
  },
  indicator: {
    width: TAB_WIDTH,
    height: SWITCH_HEIGHT - PADDING * 2,
    borderRadius: (SWITCH_HEIGHT - PADDING * 2) / 2,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    position: "absolute",
    left: PADDING,
    top: PADDING,
  },
  iconsContainer: {
    flexDirection: "row",
    ...StyleSheet.absoluteFillObject,
    padding: PADDING,
  },
  tab: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
});
