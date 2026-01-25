import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";

const AREA_OPTIONS = [
  "Trabalho",
  "Estudo",
  "Ansiedade",
  "Saude",
  "Ideias",
  "Financas",
  "Familia",
  "Organizacao",
  "Motivacao",
  "Desenvolver bons habitos",
  "beber agua",
];

const STEPS = [
  {
    id: "intro",
    title: "Vamos calibrar a sua IA para o seu jeito",
  },
  {
    id: "time",
    title: "Que horas voce acorda",
  },
  {
    id: "areas",
    title: "Quais areas da sua vida voce quer que eu tenha mais atencao",
  },
];

const TYPE_INTERVAL_MS = 18;

interface OnboardingFlowProps {
  onComplete?: () => Promise<void> | void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [wakeTime, setWakeTime] = useState(() => {
    const initial = new Date();
    initial.setHours(7, 0, 0, 0);
    return initial;
  });
  const [showTimePicker, setShowTimePicker] = useState(Platform.OS === "ios");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const lastHapticIndex = useRef(0);
  const hasOpenedTimePicker = useRef(false);

  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const isTimeStep = step.id === "time";
  const isAreasStep = step.id === "areas";

  useEffect(() => {
    setTypedText("");
    setIsTypingComplete(false);
    fadeAnim.setValue(0);
    lastHapticIndex.current = 0;

    let currentIndex = 0;
    const interval = setInterval(() => {
      currentIndex += 1;
      setTypedText(step.title.slice(0, currentIndex));
      if (currentIndex % 3 === 0 && lastHapticIndex.current !== currentIndex) {
        lastHapticIndex.current = currentIndex;
        void Haptics.selectionAsync();
      }
      if (currentIndex >= step.title.length) {
        clearInterval(interval);
        setIsTypingComplete(true);
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }
    }, TYPE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [step.title, fadeAnim]);

  useEffect(() => {
    if (!isTypingComplete) return;

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, isTypingComplete]);

  useEffect(() => {
    if (!isTimeStep) {
      hasOpenedTimePicker.current = false;
      setShowTimePicker(Platform.OS === "ios");
      return;
    }

    if (Platform.OS === "ios") {
      setShowTimePicker(true);
      return;
    }

    if (isTypingComplete && !hasOpenedTimePicker.current) {
      hasOpenedTimePicker.current = true;
      setShowTimePicker(true);
    }
  }, [isTimeStep, isTypingComplete]);

  const handleTimeChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (selectedDate) {
      setWakeTime(selectedDate);
    }
    if (Platform.OS === "android") {
      setShowTimePicker(false);
    }
  };

  const toggleArea = (area: string) => {
    setSelectedAreas((prev) =>
      prev.includes(area)
        ? prev.filter((item) => item !== area)
        : [...prev, area],
    );
  };

  const handleContinue = async () => {
    if (isSubmitting) return;

    if (!isLastStep) {
      setStepIndex((prev) => prev + 1);
      return;
    }

    if (!onComplete) return;

    try {
      setIsSubmitting(true);
      await onComplete();
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isButtonDisabled =
    isSubmitting ||
    !isTypingComplete ||
    (isAreasStep && selectedAreas.length === 0);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#F6F2EE", "#F1EBE6"]}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.content,
          { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={styles.titleContainer}>
          <Text style={styles.titleText}>
            {typedText}
            <Text style={styles.titleDot}> ●</Text>
          </Text>
        </View>

        <View style={styles.middleContainer}>
          {isTimeStep ? (
            <Animated.View
              style={[styles.middleContent, { opacity: fadeAnim }]}
              pointerEvents={isTypingComplete ? "auto" : "none"}
            >
              {showTimePicker ? (
                <DateTimePicker
                  value={wakeTime}
                  mode="time"
                  display="spinner"
                  onChange={handleTimeChange}
                  style={styles.timePicker}
                />
              ) : null}
            </Animated.View>
          ) : null}
          {isAreasStep ? (
            <Animated.View
              style={[styles.middleContent, { opacity: fadeAnim }]}
              pointerEvents={isTypingComplete ? "auto" : "none"}
            >
              <Text style={styles.helperText}>Selecione uma ou varias...</Text>
              <View style={styles.chipContainer}>
                {AREA_OPTIONS.map((area) => {
                  const isSelected = selectedAreas.includes(area);
                  return (
                    <Pressable
                      key={area}
                      onPress={() => toggleArea(area)}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          isSelected && styles.chipTextSelected,
                        ]}
                      >
                        {area}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          ) : null}
        </View>

        <View style={styles.buttonContainer}>
          <Pressable
            onPress={handleContinue}
            disabled={isButtonDisabled}
            style={({ pressed }) => [
              styles.button,
              isButtonDisabled && styles.buttonDisabled,
              pressed && !isButtonDisabled && styles.buttonPressed,
            ]}
          >
            <Text
              style={[
                styles.buttonText,
                isButtonDisabled && styles.buttonTextDisabled,
              ]}
            >
              Continuar
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F2EE",
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
  },
  titleContainer: {
    alignItems: "flex-start",
  },
  titleText: {
    fontFamily: "Inter",
    fontWeight: "700",
    fontSize: 26,
    lineHeight: 34,
    color: "#1C1B1A",
  },
  titleDot: {
    fontSize: 20,
  },
  middleContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  middleContent: {
    alignItems: "center",
    paddingHorizontal: 12,
  },
  timePicker: {
    width: "100%",
  },
  helperText: {
    fontFamily: "Inter",
    fontWeight: "500",
    fontSize: 13,
    color: "#8D8782",
    marginBottom: 18,
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  chip: {
    borderWidth: 1,
    borderColor: "#D6D0CA",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 4,
    marginBottom: 10,
    backgroundColor: "#F7F3EF",
  },
  chipSelected: {
    backgroundColor: "#111111",
    borderColor: "#111111",
  },
  chipText: {
    fontFamily: "Inter",
    fontWeight: "500",
    fontSize: 12,
    color: "#514C47",
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  buttonContainer: {
    paddingTop: 12,
  },
  button: {
    backgroundColor: "#000000",
    borderRadius: 32,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    backgroundColor: "#C9C4BF",
  },
  buttonText: {
    fontFamily: "Inter",
    fontWeight: "600",
    fontSize: 16,
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  buttonTextDisabled: {
    color: "#88827C",
  },
});
