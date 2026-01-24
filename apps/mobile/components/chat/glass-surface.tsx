import React from "react";
import {
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";

const glassAvailable = isLiquidGlassAvailable();

type GlassSurfaceProps = {
  style?: StyleProp<ViewStyle>;
  highlightOpacity?: number;
  pointerEvents?: "none" | "auto";
  children?: React.ReactNode;
};

export function GlassSurface({
  style,
  highlightOpacity = 0.55,
  pointerEvents = "none",
  children,
}: GlassSurfaceProps) {
  if (!glassAvailable) {
    return null;
  }

  return (
    <GlassView
      glassEffectStyle="clear"
      style={style}
      tintColor="rgba(255,255,255,0.5)"
      pointerEvents={pointerEvents}
    >
      {children}
    </GlassView>
  );
}

type GlassIconButtonProps = {
  onPress?: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  glassStyle?: StyleProp<ViewStyle>;
  fallbackStyle?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  hitSlop?: PressableProps["hitSlop"];
  disabled?: boolean;
  useDefaultGlassStyle?: boolean;
};

export function GlassIconButton({
  onPress,
  children,
  style,
  glassStyle,
  fallbackStyle,
  pressedStyle,
  hitSlop,
  disabled = false,
  useDefaultGlassStyle = true,
}: GlassIconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      disabled={disabled}
      style={({ pressed }) => [
        styles.iconButtonBase,
        style,
        glassAvailable && useDefaultGlassStyle ? styles.iconButtonGlass : null,
        glassAvailable ? glassStyle : fallbackStyle,
        pressed && styles.iconButtonPressed,
        pressed && pressedStyle,
      ]}
    >
      <GlassSurface style={StyleSheet.absoluteFill} />
      {children}
    </Pressable>
  );
}

export const isGlassAvailable = glassAvailable;

const styles = StyleSheet.create({
  iconButtonBase: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderCurve: "continuous",
  },
  iconButtonGlass: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
    boxShadow: "0 16px 32px rgba(15, 23, 42, 0.16)",
  },
  iconButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
});
