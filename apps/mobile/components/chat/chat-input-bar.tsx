import React, { useEffect, useState } from "react";
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Text,
  Keyboard,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { LAYOUT } from "../../constants/layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { VoiceRecordingBar } from "./voice-recording-bar";
import { VoiceSessionStatus } from "../../hooks/useVoiceSession";
import { GlassSurface, isGlassAvailable } from "./glass-surface";

// Custom easing: cubic-bezier(0.22, 1, 0.36, 1) - easeOutExpo feel
const customEasing = Easing.bezier(0.22, 1, 0.36, 1);
const ANIMATION_DURATION = 350;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface ChatInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onVoicePress?: () => void;
  placeholder?: string;
  allowSend?: boolean;
  primaryAction?: "voice" | "plus";
  displayMode?: "chat" | "drawer" | "widgets";
  // Voice session props
  isVoiceActive?: boolean;
  voiceElapsedTime?: number;
  voiceAudioLevel?: number;
  voiceAiAudioLevel?: number;
  voiceIsSpeaking?: boolean;
  voiceIsMuted?: boolean;
  voiceStatus?: VoiceSessionStatus;
  onVoiceGenerate?: () => void;
  onVoiceMuteToggle?: () => void;
  onVoiceClose?: () => void;
}

export function ChatInputBar({
  value,
  onChangeText,
  onSend,
  onVoicePress,
  placeholder = "Mensagem...",
  allowSend = true,
  primaryAction = "voice",
  displayMode = "chat",
  isVoiceActive = false,
  voiceElapsedTime = 0,
  voiceAudioLevel = 0,
  voiceAiAudioLevel = 0,
  voiceIsSpeaking = false,
  voiceIsMuted = false,
  voiceStatus = "idle",
  onVoiceGenerate,
  onVoiceMuteToggle,
  onVoiceClose,
}: ChatInputBarProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const inputRef = React.useRef<TextInput>(null);
  const glassEnabled = isGlassAvailable;
  const morphingIconColor = glassEnabled ? "#0B0B0C" : "#FFFFFF";
  const morphingLabelStyle = glassEnabled
    ? styles.faleTextGlass
    : styles.faleText;
  const isChatMode = displayMode === "chat";
  const canSend = allowSend && value.trim().length > 0;
  const canStartVoice =
    !isVoiceActive &&
    (voiceStatus === "idle" ||
      voiceStatus === "disconnected" ||
      voiceStatus === "error");
  const isWidgetMode = displayMode === "widgets";
  const [glassKey, setGlassKey] = React.useState(0);
  const handleVoicePress = React.useCallback(() => {
    if (!canStartVoice) return;
    onVoicePress?.();
  }, [canStartVoice, onVoicePress]);

  // State for expansion based on keyboard
  const isExpanded = useSharedValue(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = React.useState(false);
  const [contentHeight, setContentHeight] = React.useState(100);
  const showCollapsedSend =
    isChatMode && !isKeyboardVisible && !isVoiceActive && canSend;
  const collapsedMode = showCollapsedSend ? "send" : primaryAction;

  // Internal button size
  const INTERNAL_BUTTON_SIZE = 42;
  const collapsedButtonWidth =
    collapsedMode === "plus"
      ? 48
      : collapsedMode === "send"
        ? LAYOUT.BUTTON_SIZE
        : 90;
  const internalButtonWidth = useSharedValue(
    canSend ? INTERNAL_BUTTON_SIZE : collapsedButtonWidth,
  );
  const backgroundButtonWidth = useSharedValue(
    canSend ? LAYOUT.BUTTON_SIZE : collapsedButtonWidth,
  );

  // Morphing button animation values
  const COLLAPSED_WIDTH =
    collapsedMode === "plus"
      ? 48
      : collapsedMode === "send"
        ? LAYOUT.BUTTON_SIZE
        : 90;
  const COLLAPSED_HEIGHT =
    collapsedMode === "plus" || collapsedMode === "send"
      ? 48
      : LAYOUT.INPUT_HEIGHT;
  const LEFT_SPACING = 16; // Spacing from left screen edge when expanded
  const FULL_WIDTH = screenWidth - 12 - LEFT_SPACING; // From right inset to left margin
  const morphingWidth = useSharedValue(COLLAPSED_WIDTH);
  const widgetModeProgress = useSharedValue(isWidgetMode ? 1 : 0);
  const internalActionVisibility = useSharedValue(1);
  const outerActionVisibility = useSharedValue(1);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardWillShow", () => {
      isExpanded.value = withTiming(1, {
        duration: ANIMATION_DURATION,
        easing: customEasing,
      });
      setIsKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener("keyboardWillHide", () => {
      isExpanded.value = withTiming(0, {
        duration: ANIMATION_DURATION,
        easing: customEasing,
      });
      setIsKeyboardVisible(false);
      inputRef.current?.blur();
    });

    const showSubDid = Keyboard.addListener("keyboardDidShow", () => {
      isExpanded.value = withTiming(1, {
        duration: ANIMATION_DURATION,
        easing: customEasing,
      });
      setIsKeyboardVisible(true);
    });
    const hideSubDid = Keyboard.addListener("keyboardDidHide", () => {
      isExpanded.value = withTiming(0, {
        duration: ANIMATION_DURATION,
        easing: customEasing,
      });
      setIsKeyboardVisible(false);
      inputRef.current?.blur();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      showSubDid.remove();
      hideSubDid.remove();
    };
  }, []);

  // Animate morphing button width when voice active changes
  useEffect(() => {
    const targetWidth =
      isVoiceActive && primaryAction === "voice" ? FULL_WIDTH : COLLAPSED_WIDTH;
    morphingWidth.value = withTiming(targetWidth, {
      duration: ANIMATION_DURATION,
      easing: customEasing,
    });
  }, [isVoiceActive, FULL_WIDTH, COLLAPSED_WIDTH, primaryAction]);

  useEffect(() => {
    widgetModeProgress.value = withTiming(isWidgetMode ? 1 : 0, {
      duration: ANIMATION_DURATION,
      easing: customEasing,
    });
  }, [isWidgetMode]);

  useEffect(() => {
    setGlassKey((prev) => prev + 1);
  }, [displayMode, isVoiceActive]);

  useEffect(() => {
    internalActionVisibility.value = withTiming(1, {
      duration: 180,
      easing: customEasing,
    });
  }, []);

  useEffect(() => {
    const shouldHideOuterAction =
      !isWidgetMode &&
      isChatMode &&
      isKeyboardVisible &&
      value.trim().length > 0;
    outerActionVisibility.value = withTiming(shouldHideOuterAction ? 0 : 1, {
      duration: 180,
      easing: customEasing,
    });
  }, [isChatMode, isKeyboardVisible, value, isWidgetMode]);

  const expandedInputWidth = screenWidth - 24 + 4;
  const bottomInset = Math.max(insets.bottom, 12);

  const wrapperAnimatedStyle = useAnimatedStyle(() => {
    const expanded = isExpanded.value;
    const currentCollapsedWidth =
      screenWidth - 24 - backgroundButtonWidth.value - 10;
    const width = interpolate(
      expanded,
      [0, 1],
      [currentCollapsedWidth, expandedInputWidth],
    );
    const height = interpolate(
      expanded,
      [0, 1],
      [LAYOUT.INPUT_HEIGHT, contentHeight],
    );
    const borderRadius = interpolate(
      expanded,
      [0, 1],
      [LAYOUT.INPUT_HEIGHT / 2, 24],
    );

    return {
      width,
      height,
      borderRadius,
      bottom: 0,
      zIndex: expanded > 0.1 ? 50 : 10,
    };
  });

  const inputAnimatedStyle = useAnimatedStyle(() => {
    const expanded = isExpanded.value;
    const paddingTop = interpolate(expanded, [0, 1], [14, 12]);
    const paddingBottom = interpolate(expanded, [0, 1], [14, 8]);
    const paddingLeft = interpolate(expanded, [0, 1], [LAYOUT.BUTTON_SIZE, 16]);
    const paddingRight = interpolate(expanded, [0, 1], [12, 16]);
    const expandedInputHeight = contentHeight - 40; // Adjusted for better internal alignment

    return {
      paddingTop,
      paddingBottom,
      paddingLeft,
      paddingRight,
      height: interpolate(
        expanded,
        [0, 1],
        [LAYOUT.INPUT_HEIGHT, expandedInputHeight],
      ),
    };
  });

  const plusButtonAnimatedStyle = useAnimatedStyle(() => {
    const collapsedTop = (LAYOUT.INPUT_HEIGHT - LAYOUT.BUTTON_SIZE) / 2;
    const bottomPosition = contentHeight - 56;
    const top = interpolate(
      isExpanded.value,
      [0, 1],
      [collapsedTop, bottomPosition],
    );
    const left = interpolate(isExpanded.value, [0, 1], [0, 12]);

    return {
      top,
      left,
      width: LAYOUT.BUTTON_SIZE,
      height: LAYOUT.BUTTON_SIZE,
    };
  });

  const internalFaleButtonAnimatedStyle = useAnimatedStyle(() => {
    const visibility = internalActionVisibility.value;
    const baseOpacity = interpolate(
      isExpanded.value,
      [0.8, 1],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const baseScale = interpolate(
      isExpanded.value,
      [0.8, 1],
      [0.8, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: baseOpacity * visibility,
      transform: [
        {
          scale: baseScale * (0.9 + 0.1 * visibility),
        },
      ],
      width: internalButtonWidth.value,
    };
  });

  useEffect(() => {
    const baseWidth =
      isKeyboardVisible && canSend ? LAYOUT.BUTTON_SIZE : collapsedButtonWidth;
    internalButtonWidth.value = withTiming(
      canSend ? INTERNAL_BUTTON_SIZE : baseWidth,
      { duration: ANIMATION_DURATION, easing: customEasing },
    );
    backgroundButtonWidth.value = withTiming(
      canSend ? LAYOUT.BUTTON_SIZE : baseWidth,
      { duration: ANIMATION_DURATION, easing: customEasing },
    );
  }, [canSend, collapsedButtonWidth, isKeyboardVisible]);

  const handleContentSizeChange = (event: any) => {
    const newHeight = event.nativeEvent.contentSize.height;
    const calculatedHeight = Math.min(Math.max(newHeight + 50, 100), 200);
    setContentHeight(calculatedHeight);
  };

  const handleSend = () => {
    Keyboard.dismiss();
    onSend();
  };

  const backgroundButtonAnimatedStyle = useAnimatedStyle(() => {
    return {
      width: backgroundButtonWidth.value,
      opacity: interpolate(
        isExpanded.value,
        [0, 0.3],
        [1, 0],
        Extrapolation.CLAMP,
      ),
    };
  });

  // Morphing button style - width animates from collapsed to full
  const morphingButtonStyle = useAnimatedStyle(() => {
    const containerWidth = screenWidth - 24;
    const centeredShift = -0.5 * (containerWidth - morphingWidth.value);
    return {
      width: morphingWidth.value,
      bottom: 0,
      height: COLLAPSED_HEIGHT,
      borderRadius: COLLAPSED_HEIGHT / 2,
      opacity: outerActionVisibility.value,
      transform: [{ translateX: centeredShift * widgetModeProgress.value }],
    };
  });

  // Fale content fades out as button expands
  const faleContentStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      morphingWidth.value,
      [COLLAPSED_WIDTH, COLLAPSED_WIDTH + 60],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return {
      opacity: progress,
      transform: [{ scale: progress }],
    };
  });

  // Voice content fades in as button expands
  const voiceContentStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      morphingWidth.value,
      [FULL_WIDTH - 80, FULL_WIDTH],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: progress,
    };
  });

  // Input wrapper fades out when voice is active
  const inputFadeStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      morphingWidth.value,
      [COLLAPSED_WIDTH, COLLAPSED_WIDTH + 40],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return {
      opacity: progress,
      transform: [{ scale: interpolate(progress, [0, 1], [0.98, 1]) }],
    };
  });

  const widgetInputFadeStyle = useAnimatedStyle(() => {
    const progress = widgetModeProgress.value;
    return {
      opacity: interpolate(progress, [0, 1], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(progress, [0, 1], [0, 12]) },
        { scale: interpolate(progress, [0, 1], [1, 0.96]) },
      ],
    };
  });

  return (
    <KeyboardStickyView offset={{ closed: 0, opened: 8 }}>
      <View
        style={[
          styles.outerContainer,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        {/* Main Content Row */}
        <View style={styles.contentRow}>
          {isChatMode &&
            !isKeyboardVisible &&
            !isVoiceActive &&
            !isWidgetMode && (
              <Pressable
                style={styles.focusOverlay}
                onPress={() => inputRef.current?.focus()}
              />
            )}
          {/* Input Wrapper - Hidden in widget mode */}
          {!isWidgetMode && (
            <Animated.View
              style={[
                styles.expandingInputWrapper,
                glassEnabled
                  ? styles.expandingInputGlass
                  : styles.expandingInputFallback,
                wrapperAnimatedStyle,
                inputFadeStyle,
                widgetInputFadeStyle,
              ]}
              pointerEvents={isVoiceActive ? "none" : "auto"}
            >
              <GlassSurface
                key={`input-glass-${glassKey}`}
                style={StyleSheet.absoluteFill}
                highlightOpacity={0.6}
              />
              {/* Invisible pressable overlay when collapsed */}
              {!isKeyboardVisible && !isVoiceActive && (
                <Pressable
                  style={[
                    StyleSheet.absoluteFill,
                    { right: isChatMode ? 0 : 100 },
                  ]}
                  onPress={() => inputRef.current?.focus()}
                />
              )}

              {/* Plus Button */}
              <AnimatedPressable
                style={[styles.plusButton, plusButtonAnimatedStyle]}
              >
                <Ionicons
                  name="add"
                  size={30}
                  color={primaryAction === "plus" ? "#FFF" : "#999"}
                />
              </AnimatedPressable>

              {/* Text Input */}
              <AnimatedTextInput
                ref={inputRef}
                style={[styles.textInput, inputAnimatedStyle]}
                value={value}
                onChangeText={onChangeText}
                onContentSizeChange={handleContentSizeChange}
                placeholder={
                  isKeyboardVisible ? "Pergunte alguma coisa" : placeholder
                }
                placeholderTextColor="#8E8E93"
                multiline
                textAlignVertical={isKeyboardVisible ? "top" : "center"}
              />

              {/* Internal Fale/Send Button */}
              <AnimatedPressable
                style={[
                  styles.internalFaleButton,
                  internalFaleButtonAnimatedStyle,
                ]}
                onPress={canSend ? handleSend : handleVoicePress}
                disabled={!canSend && !canStartVoice}
              >
                <LinearGradient
                  colors={["black", "black"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.internalFaleContent}
                >
                  {canSend ? (
                    <Ionicons name="arrow-up" size={24} color="#FFF" />
                  ) : primaryAction === "plus" ? (
                    <Ionicons name="add" size={22} color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="mic-outline" size={18} color="#FFF" />
                      <Text style={styles.internalFaleText}>Fale</Text>
                    </>
                  )}
                </LinearGradient>
              </AnimatedPressable>
            </Animated.View>
          )}

          {/* Morphing Fale Button - Expands into Voice Player */}
          <Animated.View
            style={[
              styles.morphingButton,
              glassEnabled
                ? styles.morphingButtonGlass
                : styles.morphingButtonFallback,
              morphingButtonStyle,
            ]}
            pointerEvents="box-none"
          >
            <GlassSurface
              key={`morph-glass-${glassKey}`}
              style={StyleSheet.absoluteFill}
              highlightOpacity={0.65}
            />
            {/* Fale Button Content - Fades out */}
            <Animated.View
              style={[styles.faleContentWrapper, faleContentStyle]}
              pointerEvents={isKeyboardVisible ? "none" : "auto"}
            >
              <Pressable
                style={styles.faleButtonInner}
                onPress={showCollapsedSend ? handleSend : handleVoicePress}
                disabled={showCollapsedSend ? !canSend : !canStartVoice}
              >
                {showCollapsedSend ? (
                  <Ionicons
                    name="arrow-up"
                    size={22}
                    color={morphingIconColor}
                  />
                ) : primaryAction === "plus" ? (
                  <Ionicons name="add" size={22} color={morphingIconColor} />
                ) : (
                  <>
                    <Ionicons
                      name="mic-outline"
                      size={18}
                      color={morphingIconColor}
                    />
                    <Text style={morphingLabelStyle}>Fale</Text>
                  </>
                )}
              </Pressable>
            </Animated.View>

            {primaryAction === "voice" && (
              <Animated.View
                style={[styles.voiceContentWrapper, voiceContentStyle]}
                pointerEvents={isVoiceActive ? "auto" : "none"}
              >
                <VoiceRecordingBar
                  elapsedTime={voiceElapsedTime || 0}
                  audioLevel={voiceAudioLevel || 0}
                  aiAudioLevel={voiceAiAudioLevel || 0}
                  isSpeaking={voiceIsSpeaking || false}
                  isMuted={voiceIsMuted || false}
                  status={voiceStatus || "idle"}
                  onGenerate={onVoiceGenerate || (() => {})}
                  onKeyboardPress={() => {
                    onVoiceClose?.();
                    setTimeout(() => inputRef.current?.focus(), 100);
                  }}
                  onMuteToggle={onVoiceMuteToggle || (() => {})}
                  onClose={onVoiceClose || (() => {})}
                />
              </Animated.View>
            )}
          </Animated.View>
        </View>
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  contentRow: {
    position: "relative",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    minHeight: LAYOUT.INPUT_HEIGHT,
    gap: 10,
  },
  focusOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  expandingInputWrapper: {
    position: "absolute",
    left: 0,
    overflow: "hidden",
    borderCurve: "continuous",
  },
  expandingInputFallback: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "rgba(0,0,0,0.4)",
    elevation: 1,
  },
  expandingInputGlass: {
    backgroundColor: "transparent",
    borderWidth: 1,

    borderColor: "rgba(255,255,255,0.6)",
    boxShadow: "0 18px 36px rgba(15, 23, 42, 0.14)",
  },
  plusButton: {
    position: "absolute",
    width: LAYOUT.BUTTON_SIZE,
    height: LAYOUT.BUTTON_SIZE,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  textInput: {
    width: "100%",
    color: "#0B0B0C",
    fontSize: 16,
  },
  internalFaleButton: {
    position: "absolute",
    right: 12,
    bottom: 4,
    height: 42,
    borderRadius: 21,
    overflow: "hidden",
    borderCurve: "continuous",
  },
  internalFaleContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  faleText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 17,
  },
  faleTextGlass: {
    color: "#0B0B0C",
    fontWeight: "700",
    fontSize: 17,
  },
  internalFaleText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 17,
  },
  morphingButton: {
    position: "absolute",
    right: 0,
    borderRadius: LAYOUT.INPUT_HEIGHT / 2,
    overflow: "hidden",
    borderCurve: "continuous",
    zIndex: 10,
  },
  morphingButtonFallback: {
    backgroundColor: "#2A2A2A",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  morphingButtonGlass: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    boxShadow: "0 18px 40px rgba(15, 23, 42, 0.16)",
  },
  faleContentWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  faleButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "center",
    height: "100%",
    paddingHorizontal: 16,
  },
  voiceContentWrapper: {
    ...StyleSheet.absoluteFillObject,
  },
});
