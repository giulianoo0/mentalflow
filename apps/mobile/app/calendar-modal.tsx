import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassIconButton, GlassSurface } from "@/components/chat/glass-surface";
import { useQuery } from "convex/react";
import { api } from "../../../packages/fn/convex/_generated/api";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

const weekdayShort = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const { width: screenWidth } = Dimensions.get("window");
const easeOutQuint = Easing.bezier(0.23, 1, 0.32, 1);

type EventWidget = {
  nanoId: string;
  type: "event";
  title: string;
  data?: {
    event?: { startsAt?: number; endsAt?: number; location?: string };
  };
};

function buildTimeSlots(activeDate: Date, today: Date, events: EventWidget[]) {
  const nowHour = today.getHours();
  const startHour = 0;
  const endHour = 23;
  const dayStart = new Date(activeDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const dayEvents = events
    .filter((event) => {
      const startsAt = event.data?.event?.startsAt;
      if (!startsAt) return false;
      const start = new Date(startsAt);
      return start >= dayStart && start < dayEnd;
    })
    .sort(
      (a, b) => (a.data?.event?.startsAt || 0) - (b.data?.event?.startsAt || 0),
    );

  const slotEvents = new Map<number, { title: string; duration: string }>();

  for (const event of dayEvents) {
    const startsAt = event.data?.event?.startsAt;
    if (!startsAt) continue;
    const start = new Date(startsAt);
    const hour = start.getHours();
    if (hour < startHour || hour > endHour) continue;
    if (slotEvents.has(hour)) continue;
    const endsAt = event.data?.event?.endsAt;
    let duration = "1h";
    if (endsAt && endsAt > startsAt) {
      const diffMinutes = Math.max(
        15,
        Math.round((endsAt - startsAt) / (1000 * 60)),
      );
      if (diffMinutes >= 60) {
        duration = `${Math.max(1, Math.round(diffMinutes / 60))}h`;
      } else {
        duration = `${diffMinutes}min`;
      }
    }
    slotEvents.set(hour, {
      title: event.title || "Evento",
      duration,
    });
  }

  const slots = [] as {
    time: string;
    isNow?: boolean;
    event?: { title: string; duration: string };
  }[];

  for (let hour = startHour; hour <= endHour; hour += 1) {
    const time = `${String(hour).padStart(2, "0")}:00`;
    slots.push({
      time,
      isNow: hour === nowHour,
      event: slotEvents.get(hour),
    });
  }

  return slots;
}

export default function CalendarModal() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const flowId = (params.flowId as string) || undefined;
  const insets = useSafeAreaInsets();
  const today = React.useMemo(() => new Date(), []);
  const [activeDate, setActiveDate] = React.useState(today);
  const translateX = useSharedValue(-screenWidth);
  const widgets = useQuery(
    api.widgets.listByFlow,
    flowId ? { flowNanoId: flowId } : "skip",
  );
  const events = React.useMemo(
    () =>
      (widgets || []).filter((widget) => widget.type === "event") as
        | EventWidget[]
        | [],
    [widgets],
  );

  const [previousDate, setPreviousDate] = React.useState(activeDate);
  const shiftActiveDate = React.useCallback((delta: number) => {
    setActiveDate((prev) => {
      setPreviousDate(prev);
      const next = new Date(prev);
      next.setDate(prev.getDate() + delta);
      return next;
    });
  }, []);
  const handleSelectDate = React.useCallback(
    (date: Date) => {
      setPreviousDate(activeDate);
      setActiveDate(date);
    },
    [activeDate],
  );

  const getWeekStart = React.useCallback((date: Date) => {
    const start = new Date(date);
    const day = start.getDay();
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);
    return start;
  }, []);

  const weekOffsets = [-7, 0, 7];
  const weekPages = React.useMemo(() => {
    return weekOffsets.map((offset) => {
      const base = new Date(activeDate);
      base.setDate(base.getDate() + offset);
      const start = getWeekStart(base);
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return {
          date,
          dayInitial: weekdayShort[date.getDay()].charAt(0),
          dateLabel: String(date.getDate()).padStart(2, "0"),
          muted: date.toDateString() < today.toDateString(),
        };
      });
    });
  }, [activeDate, getWeekStart, today]);

  const rangeLabel = "Hoje";

  const timeSlots = React.useMemo(
    () => buildTimeSlots(activeDate, today, events),
    [activeDate, today, events],
  );
  const prevDate = React.useMemo(() => {
    const next = new Date(activeDate);
    next.setDate(activeDate.getDate() - 1);
    return next;
  }, [activeDate]);
  const nextDate = React.useMemo(() => {
    const next = new Date(activeDate);
    next.setDate(activeDate.getDate() + 1);
    return next;
  }, [activeDate]);
  const prevSlots = React.useMemo(
    () => buildTimeSlots(prevDate, today, events),
    [prevDate, today, events],
  );
  const nextSlots = React.useMemo(
    () => buildTimeSlots(nextDate, today, events),
    [nextDate, today, events],
  );

  const buildPanGesture = React.useCallback(
    () =>
      Gesture.Pan()
        .activeOffsetX([-8, 8])
        .failOffsetY([-80, 80])
        .onUpdate((event) => {
          const clamped = Math.max(-160, Math.min(160, event.translationX));
          translateX.value = -screenWidth + clamped;
        })
        .onEnd((event) => {
          const threshold = 40;
          const direction =
            event.translationX < -threshold
              ? 1
              : event.translationX > threshold
                ? -1
                : 0;
          if (direction === 0) {
            translateX.value = withTiming(-screenWidth, {
              duration: 220,
              easing: easeOutQuint,
            });
            return;
          }
          const exitX = direction === 1 ? -screenWidth * 2 : 0;
          translateX.value = withTiming(
            exitX,
            { duration: 220, easing: easeOutQuint },
            (finished) => {
              if (finished) {
                runOnJS(shiftActiveDate)(direction);
                translateX.value = -screenWidth;
              }
            },
          );
        }),
    [shiftActiveDate, translateX],
  );

  const panGesture = React.useMemo(() => buildPanGesture(), [buildPanGesture]);
  const weekScrollRef = React.useRef<ScrollView>(null);

  const handleWeekScrollEnd = React.useCallback(
    (event: any) => {
      const x = event.nativeEvent.contentOffset.x;
      const page = Math.round(x / screenWidth);
      if (page === 1) return;
      shiftActiveDate(page === 0 ? -7 : 7);
      requestAnimationFrame(() => {
        weekScrollRef.current?.scrollTo({ x: screenWidth, animated: false });
      });
    },
    [shiftActiveDate],
  );
  const slidingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureHandlerRootView style={styles.screen}>
      <View style={styles.background} />
      <View style={styles.sheet}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 120 + insets.bottom },
          ]}
          bounces={false}
          alwaysBounceVertical={false}
          stickyHeaderIndices={[0]}
        >
          <View style={styles.stickyHeaderGroup}>
            <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
              <View style={styles.headerRow}>
                <View style={styles.headerSpacer} />
                <View style={styles.titlePill}>
                  <GlassSurface style={StyleSheet.absoluteFill} />
                  <Text style={styles.headerTitle}>Calendário</Text>
                </View>
                <GlassIconButton
                  onPress={() => router.back()}
                  style={styles.closeButton}
                  fallbackStyle={styles.closeButtonFallback}
                >
                  <Ionicons name="close" size={18} color="#1C1C1E" />
                </GlassIconButton>
              </View>
            </View>
            <ScrollView
              ref={weekScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleWeekScrollEnd}
              contentOffset={{ x: screenWidth, y: 0 }}
              scrollEventThrottle={16}
            >
              {weekPages.map((page, pageIndex) => (
                <View key={`week-${pageIndex}`} style={styles.weekPage}>
                  {page.map((item) => {
                    const isActive =
                      item.date.toDateString() === activeDate.toDateString();
                    const isToday =
                      item.date.toDateString() === today.toDateString();
                    const isPrev =
                      item.date.toDateString() === previousDate.toDateString();
                    return (
                      <Pressable
                        key={item.date.toISOString()}
                        style={styles.weekDay}
                        onPress={() => handleSelectDate(item.date)}
                      >
                        <AnimatedDay
                          isActive={isActive}
                          isToday={isToday}
                          isPrev={isPrev}
                          isMuted={item.muted}
                          label={item.dateLabel}
                          initial={item.dayInitial}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.slideContent, slidingStyle]}>
              <View style={styles.body}>
                <View style={styles.timelineScroll}>
                  <View style={styles.timelineTrack}>
                    <View style={styles.timelinePanel}>
                      <View style={styles.timelineList}>
                        {prevSlots.map((slot) => (
                          <View key={slot.time} style={styles.timeRow}>
                            {slot.isNow ? (
                              <View style={styles.timePill}>
                                <Text style={styles.timePillText}>
                                  {slot.time}
                                </Text>
                              </View>
                            ) : (
                              <Text style={styles.timeLabel}>{slot.time}</Text>
                            )}
                            <View style={styles.timeRowContent}>
                              <View
                                style={[
                                  styles.timeLine,
                                  slot.isNow && styles.timeLineNow,
                                ]}
                              />
                              {slot.event ? (
                                <View style={styles.eventCard}>
                                  <Text style={styles.eventTitle}>
                                    {slot.event.title}
                                  </Text>
                                  <Text style={styles.eventDuration}>
                                    {slot.event.duration}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                    <View style={styles.timelinePanel}>
                      <View style={styles.timelineList}>
                        {timeSlots.map((slot) => (
                          <View key={slot.time} style={styles.timeRow}>
                            {slot.isNow ? (
                              <View style={styles.timePill}>
                                <Text style={styles.timePillText}>
                                  {slot.time}
                                </Text>
                              </View>
                            ) : (
                              <Text style={styles.timeLabel}>{slot.time}</Text>
                            )}
                            <View style={styles.timeRowContent}>
                              <View
                                style={[
                                  styles.timeLine,
                                  slot.isNow && styles.timeLineNow,
                                ]}
                              />
                              {slot.event ? (
                                <View style={styles.eventCard}>
                                  <Text style={styles.eventTitle}>
                                    {slot.event.title}
                                  </Text>
                                  <Text style={styles.eventDuration}>
                                    {slot.event.duration}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                    <View style={styles.timelinePanel}>
                      <View style={styles.timelineList}>
                        {nextSlots.map((slot) => (
                          <View key={slot.time} style={styles.timeRow}>
                            {slot.isNow ? (
                              <View style={styles.timePill}>
                                <Text style={styles.timePillText}>
                                  {slot.time}
                                </Text>
                              </View>
                            ) : (
                              <Text style={styles.timeLabel}>{slot.time}</Text>
                            )}
                            <View style={styles.timeRowContent}>
                              <View
                                style={[
                                  styles.timeLine,
                                  slot.isNow && styles.timeLineNow,
                                ]}
                              />
                              {slot.event ? (
                                <View style={styles.eventCard}>
                                  <Text style={styles.eventTitle}>
                                    {slot.event.title}
                                  </Text>
                                  <Text style={styles.eventDuration}>
                                    {slot.event.duration}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </Animated.View>
          </GestureDetector>
        </ScrollView>
        <Pressable
          style={[styles.rangeFloating, { bottom: insets.bottom + 16 }]}
          onPress={() => setActiveDate(today)}
        >
          <View style={styles.rangePillContent}>
            <GlassSurface style={StyleSheet.absoluteFill} />
            <Text style={styles.rangePillText}>{rangeLabel}</Text>
          </View>
        </Pressable>
      </View>
    </GestureHandlerRootView>
  );
}

function AnimatedDay({
  isActive,
  isToday,
  isPrev,
  isMuted,
  label,
  initial,
}: {
  isActive: boolean;
  isToday: boolean;
  isPrev: boolean;
  isMuted: boolean;
  label: string;
  initial: string;
}) {
  const scale = useSharedValue(isActive ? 1.08 : 1);
  const prevScale = useSharedValue(isPrev ? 0.96 : 1);

  React.useEffect(() => {
    scale.value = withTiming(isActive ? 1.08 : 1, {
      duration: 360,
      easing: easeOutQuint,
    });
    prevScale.value = withTiming(isPrev ? 0.96 : 1, {
      duration: 360,
      easing: easeOutQuint,
    });
  }, [isActive, isPrev]);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * prevScale.value }],
  }));

  return (
    <>
      <Text style={[styles.weekDayLabel, isMuted && styles.weekDayMuted]}>
        {initial}
      </Text>
      <Animated.View
        style={[
          styles.weekDateCircle,
          isActive && styles.weekDateCircleActive,
          circleStyle,
        ]}
      >
        <Text
          style={[
            styles.weekDateText,
            isActive && styles.weekDateTextActive,
            isToday && !isActive && styles.weekDateTextToday,
            isMuted && !isActive && styles.weekDayMuted,
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#F7F6F8",
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  titlePill: {
    borderRadius: 1000,
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    borderCurve: "continuous",
    overflow: "hidden",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  closeButtonFallback: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderCurve: "continuous",
  },
  sheet: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 8,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  slideContent: {
    paddingHorizontal: 0,
  },
  stickyHeaderGroup: {
    backgroundColor: "transparent",
  },
  weekPage: {
    width: screenWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  weekDay: {
    alignItems: "center",
    gap: 8,
  },
  weekDayLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3B3B3F",
  },
  weekDayMuted: {
    color: "#B0B0B3",
  },
  weekDateCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  weekDateCircleActive: {
    backgroundColor: "#FF8A34",
  },
  weekDateCircleToday: {
    backgroundColor: "#FFE8E6",
  },
  weekDateText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B1B1D",
  },
  weekDateTextActive: {
    color: "#FFFFFF",
  },
  weekDateTextToday: {
    color: "#E13B3B",
  },
  body: {
    flex: 1,
    flexDirection: "column",
  },
  rangeFloating: {
    position: "absolute",
    left: 16,
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    borderCurve: "continuous",
    overflow: "hidden",
    zIndex: 5,
    shadowColor: "rgba(0,0,0,0.2)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  rangePillContent: {
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rangePillText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1B1B1D",
    textAlign: "center",
  },
  timelineScroll: {
    flex: 1,
  },
  timelineTrack: {
    flexDirection: "row",
    width: screenWidth * 3,
  },
  timelinePanel: {
    width: screenWidth,
  },
  timelineList: {
    paddingBottom: 28,
    paddingHorizontal: 16,
    gap: 12,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
  },
  timeLabel: {
    width: 64,
    fontSize: 13,
    fontWeight: "600",
    color: "#A0A0A4",
  },
  timePill: {
    minWidth: 64,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: "#FF8A34",
    alignItems: "center",
  },
  timePillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  timeRowContent: {
    flex: 1,
    justifyContent: "center",
    gap: 8,
  },
  timeLine: {
    height: 1,
    backgroundColor: "#ECECEE",
  },
  timeLineNow: {
    height: 2,
    backgroundColor: "#FF8A34",
  },
  eventCard: {
    marginTop: -16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#DFFAE8",
    borderWidth: 1,
    borderColor: "#C2F0D6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "rgba(0,0,0,0.1)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E5D3B",
  },
  eventDuration: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E5D3B",
  },
});
