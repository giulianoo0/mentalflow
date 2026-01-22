import React from "react";
import {
  Text,
  StyleSheet,
  ScrollView,
  View,
  Pressable,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import { useMutation, useQuery } from "convex/react";
import Animated, { Layout } from "react-native-reanimated";
import { api } from "../../../../packages/fn/convex/_generated/api";

const { width: screenWidth } = Dimensions.get("window");
const horizontalPadding = 16;
const cardGap = 14;
const contentWidth = screenWidth - horizontalPadding * 2;
const compactMinWidth = contentWidth * 0.36;
const wideMinWidth = contentWidth * 0.58;

type WidgetType =
  | "task"
  | "person"
  | "event"
  | "note"
  | "goal"
  | "habit"
  | "health";

interface Widget {
  nanoId: string;
  type: WidgetType;
  title: string;
  description?: string;
  createdAt?: number;
  data: {
    dueDate?: number;
    priority?: "high" | "medium" | "low";
    isCompleted?: boolean;
    person?: { role?: string; contactInfo?: string; avatarUrl?: string };
    event?: { startsAt?: number; endsAt?: number; location?: string };
    habit?: { frequency?: "daily" | "weekly"; streak?: number };
    health?: {
      dosage?: string;
      schedule?: string;
      status?: "active" | "paused" | "completed";
    };
    goal?: {
      targetValue?: number;
      progress?: number;
      startValue?: number;
      log?: Record<string, number>;
    };
    relatedTitles?: string[];
    relatedTitlesCompleted?: boolean[];
    habitLog?: Record<string, boolean[]>;
  };
}

interface WidgetDrawerProps {
  flowNanoId: string | undefined;
  onClose?: () => void;
}

type RenderItem =
  | { kind: "widget"; widget: Widget }
  | { kind: "habitSummary"; habits: Widget[] }
  | { kind: "goalSummary"; goals: Widget[] };

export function WidgetDrawer({ flowNanoId, onClose }: WidgetDrawerProps) {
  console.log("[WidgetDrawer] Render with flowNanoId:", flowNanoId);
  const insets = useSafeAreaInsets();
  const widgets = useQuery(
    api.widgets.listByFlow,
    flowNanoId ? { flowNanoId } : "skip",
  );

  console.log(
    "[WidgetDrawer] Query result:",
    widgets ? `found ${widgets.length} widgets` : "loading/skip",
  );

  const widgetCards: Widget[] = widgets || [];
  const events = React.useMemo(
    () => widgetCards.filter((widget) => widget.type === "event"),
    [widgetCards],
  );
  const nonEventWidgets = React.useMemo(
    () => widgetCards.filter((widget) => widget.type !== "event"),
    [widgetCards],
  );
  const renderItems = React.useMemo(
    () => buildRenderItems(nonEventWidgets),
    [nonEventWidgets],
  );
  const widgetLayout = React.useMemo(
    () => computeWidgetLayout(renderItems),
    [renderItems],
  );

  return (
    <LinearGradient
      colors={["#FFF4EB", "#F6F9FF", "#F4F4F4"]}
      locations={[0.24, 0.53, 0.63]}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {events.length > 0 && <EventSummaryCard events={events} />}
        <View style={styles.grid}>
          {renderItems.map((item) => {
            if (item.kind === "habitSummary") {
              const layout = widgetLayout.get("__habit_summary__");
              return (
                <HabitSummaryCard
                  key="habit-summary"
                  habits={item.habits}
                  flexBasis={layout?.flexBasis ?? compactMinWidth}
                  isExpanded={layout?.isExpanded ?? false}
                />
              );
            }

            if (item.kind === "goalSummary") {
              const layout = widgetLayout.get("__goal_summary__");
              return (
                <GoalSummaryCard
                  key="goal-summary"
                  goals={item.goals}
                  flexBasis={layout?.flexBasis ?? compactMinWidth}
                  isExpanded={layout?.isExpanded ?? false}
                />
              );
            }

            const widget = item.widget;
            const layout = widgetLayout.get(widget.nanoId);
            return (
              <WidgetCard
                key={widget.nanoId}
                widget={widget}
                flexBasis={layout?.flexBasis ?? compactMinWidth}
                isExpanded={layout?.isExpanded ?? false}
              />
            );
          })}
        </View>

        {renderItems.length === 0 && events.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Sem widgets ainda</Text>
            <Text style={styles.emptySubtitle}>
              Envie uma mensagem para extrair ideias, metas e pessoas.
            </Text>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

function computeWidgetLayout(items: RenderItem[]) {
  const layout = new Map<string, { isExpanded: boolean; flexBasis: number }>();
  const minWidths = new Map<string, number>();

  for (const item of items) {
    if (item.kind === "habitSummary") {
      minWidths.set("__habit_summary__", getHabitSummaryMinWidth(item.habits));
      continue;
    }
    if (item.kind === "goalSummary") {
      minWidths.set("__goal_summary__", getGoalSummaryMinWidth(item.goals));
      continue;
    }
    minWidths.set(item.widget.nanoId, getWidgetMinWidth(item.widget));
  }

  let row: RenderItem[] = [];
  let rowWidth = 0;

  const finalizeRow = () => {
    if (row.length === 0) return;
    const isExpanded = row.length === 1;
    for (const item of row) {
      const key =
        item.kind === "habitSummary"
          ? "__habit_summary__"
          : item.kind === "goalSummary"
            ? "__goal_summary__"
            : item.widget.nanoId;
      const minWidth = minWidths.get(key) ?? compactMinWidth;
      layout.set(key, {
        isExpanded,
        flexBasis: isExpanded ? contentWidth : minWidth,
      });
    }
    row = [];
    rowWidth = 0;
  };

  for (const item of items) {
    const key =
      item.kind === "habitSummary"
        ? "__habit_summary__"
        : item.kind === "goalSummary"
          ? "__goal_summary__"
          : item.widget.nanoId;
    const minWidth = minWidths.get(key) ?? compactMinWidth;
    const needed = row.length === 0 ? minWidth : minWidth + cardGap;
    if (rowWidth + needed <= contentWidth) {
      row.push(item);
      rowWidth += needed;
    } else {
      finalizeRow();
      row.push(item);
      rowWidth = minWidth;
    }
  }

  finalizeRow();
  return layout;
}

function getWidgetMinWidth(widget: Widget) {
  const data = widget.data || {};
  const relatedTitles = Array.isArray(data.relatedTitles)
    ? data.relatedTitles.map((title) => title.trim()).filter(Boolean)
    : [];
  const isTask = widget.type === "task";
  const isHealth = widget.type === "health";

  const todoItems = isTask
    ? relatedTitles.length > 0
      ? relatedTitles
      : widget.description?.trim()
        ? [widget.description.trim()]
        : []
    : [];

  const hasHealthChecklist = isHealth && relatedTitles.length > 0;
  const hasTodoList = isTask && todoItems.length > 0;
  const isWideCard =
    (isHealth && hasHealthChecklist) ||
    (isTask && hasTodoList && todoItems.length >= 4);
  return isWideCard ? wideMinWidth : compactMinWidth;
}

function getHabitSummaryMinWidth(habits: Widget[]) {
  if (habits.length === 0) return compactMinWidth;
  const totalItems = habits.reduce((acc, habit) => {
    const data = habit.data || {};
    const related = Array.isArray(data.relatedTitles)
      ? data.relatedTitles.length
      : habit.description?.trim()
        ? 1
        : 1;
    return acc + related;
  }, 0);
  return totalItems >= 4 ? wideMinWidth : compactMinWidth;
}

function getGoalSummaryMinWidth(goals: Widget[]) {
  if (goals.length === 0) return compactMinWidth;
  return goals.length >= 2 ? wideMinWidth : compactMinWidth;
}

function buildRenderItems(widgets: Widget[]): RenderItem[] {
  const habits = widgets.filter((widget) => widget.type === "habit");
  const goals = widgets.filter((widget) => widget.type === "goal");
  const items: RenderItem[] = [];
  let insertedHabits = false;
  let insertedGoals = false;

  for (const widget of widgets) {
    if (widget.type === "habit") {
      if (!insertedHabits) {
        items.push({ kind: "habitSummary", habits });
        insertedHabits = true;
      }
      continue;
    }
    if (widget.type === "goal") {
      if (!insertedGoals) {
        items.push({ kind: "goalSummary", goals });
        insertedGoals = true;
      }
      continue;
    }
    items.push({ kind: "widget", widget });
  }

  if (!insertedHabits && habits.length > 0) {
    items.push({ kind: "habitSummary", habits });
  }
  if (!insertedGoals && goals.length > 0) {
    items.push({ kind: "goalSummary", goals });
  }

  return items;
}

function WidgetCard({
  widget,
  flexBasis,
  isExpanded,
}: {
  widget: Widget;
  flexBasis: number;
  isExpanded: boolean;
}) {
  const updateChecklist = useMutation(
    api.widgets.updateRelatedTitlesCompletion,
  );
  const updateHabitLog = useMutation(api.widgets.updateHabitLog);
  const data = widget.data || {};
  const isTask = widget.type === "task";
  const isGoal = widget.type === "goal";
  const isHabit = widget.type === "habit";
  const isHealth = widget.type === "health";
  const isEvent = widget.type === "event";
  const isPerson = widget.type === "person";
  const isNote = widget.type === "note";

  const typeColors: Record<WidgetType, string> = {
    task: "#FF6B6B",
    goal: "#4ECDC4",
    habit: "#A855F7",
    health: "#22C55E",
    event: "#3B82F6",
    person: "#F59E0B",
    note: "#6B7280",
  };

  const relatedTitles = React.useMemo(() => {
    if (!Array.isArray(data.relatedTitles)) return [];
    return data.relatedTitles.map((title) => title.trim()).filter(Boolean);
  }, [data.relatedTitles]);
  const todoItems = React.useMemo(() => {
    if (!isTask) return [];
    if (relatedTitles.length > 0) return relatedTitles;
    if (widget.description) {
      const cleaned = widget.description.trim();
      return cleaned ? [cleaned] : [];
    }
    return [];
  }, [isTask, relatedTitles, widget.description]);
  const habitItems = React.useMemo(() => {
    if (!isHabit) return [];
    if (relatedTitles.length > 0) return relatedTitles;
    if (widget.description) {
      const cleaned = widget.description.trim();
      return cleaned ? [cleaned] : [];
    }
    return [];
  }, [isHabit, relatedTitles, widget.description]);
  const hasHealthChecklist = isHealth && relatedTitles.length > 0;
  const hasTodoList = isTask && todoItems.length > 0;
  const hasHabitList = isHabit && habitItems.length > 0;
  const checklistItems = hasHealthChecklist
    ? relatedTitles
    : hasTodoList
      ? todoItems
      : hasHabitList
        ? habitItems
        : [];
  const hasChecklist = checklistItems.length > 0;
  const [todayKey, setTodayKey] = React.useState(() => formatDateKey(new Date()));
  const habitLog =
    (data.habitLog && typeof data.habitLog === "object" ? data.habitLog : {}) as
      | Record<string, boolean[]>
      | undefined;
  const habitToday = habitLog?.[todayKey];

  const initialChecked = React.useMemo(() => {
    if (!hasChecklist) return [] as boolean[];
    const saved = isHabit
      ? Array.isArray(habitToday)
        ? habitToday
        : []
      : Array.isArray(data.relatedTitlesCompleted)
        ? data.relatedTitlesCompleted
        : [];
    if (saved.length === checklistItems.length) return saved;
    return checklistItems.map(() => false);
  }, [checklistItems, data.relatedTitlesCompleted, habitToday, hasChecklist, isHabit]);
  const [checkedItems, setCheckedItems] =
    React.useState<boolean[]>(initialChecked);
  const checklistSignature = React.useMemo(
    () => `${widget.nanoId}:${checklistItems.join("|")}:${todayKey}`,
    [widget.nanoId, checklistItems, todayKey],
  );

  React.useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      0,
      0,
    );
    const timeoutMs = nextMidnight.getTime() - now.getTime();
    const timer = setTimeout(() => {
      setTodayKey(formatDateKey(new Date()));
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [todayKey]);

  React.useEffect(() => {
    if (!hasChecklist) return;
    setCheckedItems((prev) =>
      checklistItems.map(
        (_, index) => prev[index] ?? initialChecked[index] ?? false,
      ),
    );
  }, [checklistSignature, hasChecklist, checklistItems, initialChecked]);

  const totalItems = hasChecklist ? checklistItems.length : 0;
  const completedItems = hasChecklist ? checkedItems.filter(Boolean).length : 0;
  const pendingItems = totalItems - completedItems;
  const progressPercent =
    totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const checklistAccent = isHealth ? "#4AA9FF" : typeColors[widget.type];
  const cardFlexBasis = flexBasis;

  const shouldShowDescription =
    !!widget.description && !isTask && !isHabit && !(isHealth && hasHealthChecklist);

  return (
    <Animated.View
      layout={Layout.springify()}
      style={[styles.card, { flexBasis: cardFlexBasis, flexGrow: 1 }]}
    >
      {isHealth && hasHealthChecklist ? (
        <View style={styles.healthHeader}>
          <View style={styles.healthHeaderText}>
            <Text style={styles.cardTitle}>{widget.title}</Text>
            <Text style={styles.groupSummary}>
              {pendingItems}/{totalItems} pendentes
            </Text>
          </View>
          <ProgressRing
            progress={progressPercent}
            size={56}
            strokeWidth={5}
            color={checklistAccent}
            trackColor="#E6F3FF"
          />
        </View>
      ) : isTask || isHabit ? (
        <View style={styles.todoHeader}>
          <Text style={styles.cardTitle}>{widget.title}</Text>
          {isExpanded && hasChecklist && (
            isHabit ? (
              <Text style={styles.todoCounter}>
                {String(pendingItems).padStart(2, "0")} Pendentes
              </Text>
            ) : (
              <Text style={styles.todoCounter}>
                {completedItems}/{totalItems} Concluidas
              </Text>
            )
          )}
        </View>
      ) : (
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{widget.title}</Text>
        </View>
      )}

      {shouldShowDescription ? (
        <Text style={styles.cardBodyText}>{widget.description}</Text>
      ) : null}

      {isTask && hasTodoList && (
        <View style={styles.checklist}>
          {todoItems.map((item, index) => {
            const isChecked = checkedItems[index];
            return (
              <Pressable
                key={`${widget.nanoId}-task-${index}`}
                style={styles.checklistRow}
                onPress={() => {
                  const next = checkedItems.map((value, itemIndex) =>
                    itemIndex === index ? !value : value,
                  );
                  setCheckedItems(next);
                  void updateChecklist({
                    nanoId: widget.nanoId,
                    checked: next,
                  });
                }}
              >
                <View
                  style={[
                    styles.checklistBox,
                    { borderColor: checklistAccent },
                    isChecked && {
                      backgroundColor: checklistAccent,
                      borderColor: checklistAccent,
                    },
                  ]}
                >
                  {isChecked && (
                    <Ionicons name="checkmark" size={12} color="#FFF" />
                  )}
                </View>
                <Text
                  style={[
                    styles.checklistText,
                    isChecked && styles.checklistTextChecked,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {isHabit && hasHabitList && (
        <View style={styles.habitChecklist}>
          <View style={styles.habitChecklistList}>
            {habitItems.map((item, index) => {
              const isChecked = checkedItems[index];
              return (
                <Pressable
                  key={`${widget.nanoId}-habit-${index}`}
                  style={styles.habitRowItem}
                  onPress={() => {
                    const next = checkedItems.map((value, itemIndex) =>
                      itemIndex === index ? !value : value,
                    );
                    setCheckedItems(next);
                    void updateHabitLog({
                      nanoId: widget.nanoId,
                      dateKey: todayKey,
                      checked: next,
                    });
                  }}
                >
                  <View
                    style={[
                      styles.habitCircle,
                      isChecked && styles.habitCircleChecked,
                    ]}
                  />
                  <Text
                    style={[
                      styles.habitTextItem,
                      isChecked && styles.habitTextChecked,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {isExpanded && hasChecklist && (
            <View style={styles.habitProgress}>
              <ProgressRing
                progress={progressPercent}
                size={78}
                strokeWidth={7}
                color="#6BEF8D"
                trackColor="#E6F8EC"
              />
            </View>
          )}
        </View>
      )}

      {/* Todo list */}
      {isTask && !hasTodoList && (
        <Text style={styles.todoEmpty}>Sem tarefas listadas.</Text>
      )}

      {/* Goal display with progress */}
      {isGoal && (
        <View style={styles.goalMeta}>
          {data.goal?.progress !== undefined && (
            <View style={styles.progressContainer}>
              <View style={styles.progressCircle}>
                <Text style={styles.progressText}>{data.goal.progress}%</Text>
              </View>
            </View>
          )}
          {data.goal?.targetValue && (
            <Text style={styles.targetText}>Meta: {data.goal.targetValue}</Text>
          )}
        </View>
      )}

      {isHabit && !hasHabitList && (
        <Text style={styles.todoEmpty}>Sem hábitos listados.</Text>
      )}

      {/* Health display */}
      {isHealth && hasHealthChecklist && (
        <View style={styles.healthChecklist}>
          {relatedTitles.map((item, index) => {
            const isChecked = checkedItems[index];
            const match = item.match(/^(\d{1,2}[:h]\d{2})\s*(.*)$/i);
            const time = match ? match[1] : "";
            const label = match ? match[2] : item;
            const parts = label.split(" - ");
            const mainLabel = parts[0];
            const detail = parts.slice(1).join(" - ");
            return (
              <Pressable
                key={`${widget.nanoId}-health-${index}`}
                style={styles.healthChecklistRow}
                onPress={() => {
                  const next = checkedItems.map((value, itemIndex) =>
                    itemIndex === index ? !value : value,
                  );
                  setCheckedItems(next);
                  void updateChecklist({
                    nanoId: widget.nanoId,
                    checked: next,
                  });
                }}
              >
                <View
                  style={[
                    styles.checklistBox,
                    { borderColor: checklistAccent },
                    isChecked && {
                      backgroundColor: checklistAccent,
                      borderColor: checklistAccent,
                    },
                  ]}
                >
                  {isChecked && (
                    <Ionicons name="checkmark" size={12} color="#FFF" />
                  )}
                </View>
                <View style={styles.healthChecklistContent}>
                  {time ? <Text style={styles.healthTime}>{time}</Text> : null}
                  <View style={styles.healthLabelGroup}>
                    <Text style={styles.healthItemText}>{mainLabel}</Text>
                    {detail ? (
                      <Text style={styles.healthItemDetail}>{detail}</Text>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {isHealth && !hasChecklist && (
        <View style={styles.healthMeta}>
          {data.health?.dosage && (
            <View style={styles.healthRow}>
              <Ionicons name="medical-outline" size={14} color="#22C55E" />
              <Text style={styles.healthText}>{data.health.dosage}</Text>
            </View>
          )}
          {data.health?.schedule && (
            <View style={styles.healthRow}>
              <Ionicons name="time-outline" size={14} color="#22C55E" />
              <Text style={styles.healthText}>{data.health.schedule}</Text>
            </View>
          )}
          {data.health?.status && (
            <View
              style={[
                styles.statusBadge,
                data.health.status === "active" && styles.statusActive,
                data.health.status === "paused" && styles.statusPaused,
                data.health.status === "completed" && styles.statusCompleted,
              ]}
            >
              <Text style={styles.statusText}>
                {data.health.status === "active"
                  ? "Ativo"
                  : data.health.status === "paused"
                    ? "Pausado"
                    : "Concluído"}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Event display */}
      {isEvent && (
        <View style={styles.eventMeta}>
          {data.event?.startsAt && (
            <View style={styles.eventRow}>
              <Ionicons name="calendar-outline" size={14} color="#3B82F6" />
              <Text style={styles.eventText}>
                {formatDateTime(data.event.startsAt)}
              </Text>
            </View>
          )}
          {data.event?.location && (
            <View style={styles.eventRow}>
              <Ionicons name="location-outline" size={14} color="#3B82F6" />
              <Text style={styles.eventText}>{data.event.location}</Text>
            </View>
          )}
        </View>
      )}

      {/* Person display */}
      {isPerson && (
        <View style={styles.personMeta}>
          {data.person?.role && (
            <Text style={styles.personRole}>{data.person.role}</Text>
          )}
          {data.person?.contactInfo && (
            <Text style={styles.personContact}>{data.person.contactInfo}</Text>
          )}
        </View>
      )}

      {/* Note has no special fields, just title/description */}
    </Animated.View>
  );
}

function EventSummaryCard({ events }: { events: Widget[] }) {
  const now = new Date();
  const todayKey = now.toDateString();
  const dayName = now
    .toLocaleDateString("pt-BR", { weekday: "long" })
    .toUpperCase();
  const dayNumber = now.getDate();

  const todaysEvents = events.filter((event) => {
    const startsAt = event.data?.event?.startsAt;
    if (!startsAt) return false;
    return new Date(startsAt).toDateString() === todayKey;
  });
  const doneToday = todaysEvents.filter(
    (event) => (event.data?.event?.startsAt || 0) <= now.getTime(),
  ).length;
  const totalToday = todaysEvents.length;

  const sortedUpcoming = [...events]
    .filter((event) => event.data?.event?.startsAt)
    .sort(
      (a, b) => (a.data?.event?.startsAt || 0) - (b.data?.event?.startsAt || 0),
    );
  const upcomingEvents = sortedUpcoming.filter(
    (event) => (event.data?.event?.startsAt || 0) > now.getTime(),
  );

  return (
    <View style={styles.eventSummaryCard}>
      <View style={styles.eventSummaryLeft}>
        <Text style={styles.eventSummaryDay}>{dayName}</Text>
        <Text style={styles.eventSummaryDate}>{dayNumber}</Text>
        {totalToday > 0 ? (
          <Text style={styles.eventSummaryCounter}>
            {doneToday}/{totalToday} eventos
          </Text>
        ) : (
          <Text style={styles.eventSummaryEmpty}>
            Sem lembrete
            {"\n"}para hoje
          </Text>
        )}
      </View>
      <View style={styles.eventSummaryRight}>
        <Text style={styles.eventSummaryHeading}>PROXIMOS</Text>
        <View style={styles.eventSummaryList}>
          {upcomingEvents.slice(0, 4).map((event) => (
            <View key={event.nanoId} style={styles.eventSummaryItem}>
              <View style={styles.eventSummaryBar} />
              <View style={styles.eventSummaryItemText}>
                <Text
                  style={styles.eventSummaryTitle}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {event.title}
                </Text>
                <Text style={styles.eventSummaryMeta}>
                  {formatEventMeta(event.data?.event?.startsAt)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function GoalSummaryCard({
  goals,
  flexBasis,
  isExpanded,
}: {
  goals: Widget[];
  flexBasis: number;
  isExpanded: boolean;
}) {
  const goalItems = React.useMemo(() => {
    return goals.map((goal) => {
      const data = goal.data || {};
      const meta = data.goal || {};
      const startValue = meta.startValue ?? 0;
      const log = meta.log || {};
      const loggedTotal = Object.values(log).reduce((acc, value) =>
        acc + (typeof value === "number" ? value : 0), 0,
      );
      const targetValue = meta.targetValue ?? 0;
      const rawProgress = targetValue > 0
        ? Math.round(((startValue + loggedTotal) / targetValue) * 100)
        : meta.progress ?? 0;
      const progress = Math.min(100, Math.max(0, rawProgress));
      return {
        widget: goal,
        title: goal.title,
        subtitle: goal.description,
        progress,
        dueLabel: formatGoalDueDate(data.dueDate),
      };
    });
  }, [goals]);

  const columns = React.useMemo(() => {
    if (!isExpanded || goalItems.length <= 1) {
      return [goalItems];
    }
    const mid = Math.ceil(goalItems.length / 2);
    return [goalItems.slice(0, mid), goalItems.slice(mid)];
  }, [goalItems, isExpanded]);

  return (
    <Animated.View
      layout={Layout.springify()}
      style={[styles.card, { flexBasis, flexGrow: 1 }]}
    >
      <Text style={styles.goalHeader}>Metas</Text>
      <View style={styles.goalColumns}>
        {columns.map((column, columnIndex) => (
          <View key={`goal-col-${columnIndex}`} style={styles.goalColumn}>
            {column.map((item) => (
              <View key={item.widget.nanoId} style={styles.goalItem}>
                <Text
                  style={styles.goalTitle}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {item.title}
                </Text>
                {item.subtitle ? (
                  <Text style={styles.goalSubtitle}>{item.subtitle}</Text>
                ) : null}
                <View style={styles.goalProgressRow}>
                  <View style={styles.goalProgressTrack}>
                    <View
                      style={[
                        styles.goalProgressFill,
                        { width: `${item.progress}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.goalPercent}>{item.progress}%</Text>
                </View>
                {item.dueLabel ? (
                  <View style={styles.goalDueRow}>
                    <Ionicons name="calendar-outline" size={14} color="#7A7A7A" />
                    <Text style={styles.goalDueText}>{item.dueLabel}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

function HabitSummaryCard({
  habits,
  flexBasis,
  isExpanded,
}: {
  habits: Widget[];
  flexBasis: number;
  isExpanded: boolean;
}) {
  const updateHabitLog = useMutation(api.widgets.updateHabitLog);
  const [todayKey, setTodayKey] = React.useState(() => formatDateKey(new Date()));

  React.useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      0,
      0,
    );
    const timeoutMs = nextMidnight.getTime() - now.getTime();
    const timer = setTimeout(() => {
      setTodayKey(formatDateKey(new Date()));
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [todayKey]);

  const habitGroups = React.useMemo(() => {
    return habits.map((habit) => {
      const data = habit.data || {};
      const related = Array.isArray(data.relatedTitles)
        ? data.relatedTitles.map((title) => title.trim()).filter(Boolean)
        : [];
      const items = related.length
        ? related
        : habit.description?.trim()
          ? [habit.description.trim()]
          : habit.title
            ? [habit.title]
            : [];
      return { habit, items };
    });
  }, [habits]);

  const initialChecked = React.useMemo(() => {
    const next: Record<string, boolean[]> = {};
    for (const group of habitGroups) {
      const data = group.habit.data || {};
      const habitLog =
        (data.habitLog && typeof data.habitLog === "object"
          ? data.habitLog
          : {}) as Record<string, boolean[]>;
      const saved = habitLog?.[todayKey] ?? data.relatedTitlesCompleted ?? [];
      next[group.habit.nanoId] = group.items.map((_, index) =>
        Boolean(saved[index]),
      );
    }
    return next;
  }, [habitGroups, todayKey]);

  const [checkedByHabit, setCheckedByHabit] = React.useState(initialChecked);

  React.useEffect(() => {
    setCheckedByHabit(initialChecked);
  }, [initialChecked]);

  const flattenedItems = React.useMemo(() => {
    return habitGroups.flatMap((group) =>
      group.items.map((label, index) => ({
        habit: group.habit,
        label,
        index,
        createdAt: group.habit.createdAt ?? 0,
        id: `${group.habit.nanoId}:${label}:${index}`,
      })),
    );
  }, [habitGroups]);

  const orderedItems = React.useMemo(() => {
    return [...flattenedItems].sort((a, b) => {
      const aChecked = checkedByHabit[a.habit.nanoId]?.[a.index] ?? false;
      const bChecked = checkedByHabit[b.habit.nanoId]?.[b.index] ?? false;
      if (aChecked !== bChecked) return aChecked ? 1 : -1;
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      const labelCompare = a.label.localeCompare(b.label, "pt-BR");
      if (labelCompare !== 0) return labelCompare;
      return a.index - b.index;
    });
  }, [flattenedItems, checkedByHabit]);

  const totalItems = flattenedItems.length;
  const completedItems = flattenedItems.filter((item) =>
    checkedByHabit[item.habit.nanoId]?.[item.index],
  ).length;
  const pendingItems = totalItems - completedItems;
  const progressPercent = totalItems > 0
    ? Math.round((completedItems / totalItems) * 100)
    : 0;

  return (
    <Animated.View
      layout={Layout.springify()}
      style={[styles.card, { flexBasis, flexGrow: 1 }]}
    >
      <View style={styles.todoHeader}>
        <Text style={styles.cardTitle}>Habitos e rotina</Text>
        {isExpanded && totalItems > 0 && (
          <Text style={styles.todoCounter}>
            {String(pendingItems).padStart(2, "0")} Pendentes
          </Text>
        )}
      </View>

      <View style={styles.habitChecklist}>
        <View style={styles.habitChecklistList}>
          {orderedItems.map((item) => {
            const isChecked =
              checkedByHabit[item.habit.nanoId]?.[item.index] ?? false;
            return (
              <Animated.View key={item.id} layout={Layout.springify()}>
                <Pressable
                  style={styles.habitRowItem}
                  onPress={() => {
                    const current = checkedByHabit[item.habit.nanoId] || [];
                    const next = current.map((value, idx) =>
                      idx === item.index ? !value : value,
                    );
                    const nextByHabit = {
                      ...checkedByHabit,
                      [item.habit.nanoId]: next,
                    };
                    setCheckedByHabit(nextByHabit);
                    void updateHabitLog({
                      nanoId: item.habit.nanoId,
                      dateKey: todayKey,
                      checked: next,
                    });
                  }}
                >
                  <View
                    style={[
                      styles.habitCircle,
                      isChecked && styles.habitCircleChecked,
                    ]}
                  />
                  <Text
                    style={[
                      styles.habitTextItem,
                      isChecked && styles.habitTextChecked,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        {isExpanded && totalItems > 0 && (
          <View style={styles.habitProgress}>
            <ProgressRing
              progress={progressPercent}
              size={78}
              strokeWidth={7}
              color="#6BEF8D"
              trackColor="#E6F8EC"
            />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function formatDateTime(value?: number) {
  if (!value) return "Sem data";
  const date = new Date(value);
  return `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatEventMeta(value?: number) {
  if (!value) return "Sem data";
  const date = new Date(value);
  const weekday = date
    .toLocaleDateString("pt-BR", { weekday: "short" })
    .replace(".", "");
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const time = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${weekday} (${day}/${month}) ${time}`;
}

function formatGoalDueDate(value?: number) {
  if (!value) return null;
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleDateString("pt-BR", { month: "short" });
  const year = String(date.getFullYear()).slice(-2);
  return `Prazo ${day} ${month}/${year}`;
}

function ProgressRing({
  progress,
  size,
  strokeWidth,
  color,
  trackColor,
}: {
  progress: number;
  size: number;
  strokeWidth: number;
  color: string;
  trackColor: string;
}) {
  const clamped = Math.min(100, Math.max(0, progress));
  const displayValue = Math.round(clamped);
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const sweepAngle = (clamped / 100) * 360;
  const arcPath = React.useMemo(() => {
    const path = Skia.Path.Make();
    path.addArc(
      Skia.XYWHRect(
        strokeWidth / 2,
        strokeWidth / 2,
        size - strokeWidth,
        size - strokeWidth,
      ),
      -90,
      sweepAngle,
    );
    return path;
  }, [size, strokeWidth, sweepAngle]);
  const trackPath = React.useMemo(() => {
    const path = Skia.Path.Make();
    path.addCircle(center, center, radius);
    return path;
  }, [center, radius]);

  return (
    <View style={{ width: size, height: size }}>
      <Canvas style={{ width: size, height: size }}>
        <Path
          path={trackPath}
          color={trackColor}
          style="stroke"
          strokeWidth={strokeWidth}
          strokeCap="round"
        />
        <Path
          path={arcPath}
          color={color}
          style="stroke"
          strokeWidth={strokeWidth}
          strokeCap="round"
        />
      </Canvas>
      <View style={styles.progressRingLabel}>
        <Text style={styles.progressRingText}>{displayValue}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  iconPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.95)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: cardGap,
    rowGap: cardGap,
    marginTop: 14,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
    padding: 16,
    shadowColor: "rgba(0,0,0,0.25)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
  },
  cardHeader: {
    gap: 6,
  },
  todoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  todoCounter: {
    fontSize: 12,
    color: "#8C8C8C",
    fontWeight: "600",
  },
  groupSummary: {
    marginTop: 4,
    fontSize: 12,
    color: "#8C8C8C",
    fontWeight: "600",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1B1B1D",
  },
  goalHeader: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B1B1D",
    marginBottom: 12,
  },
  goalColumns: {
    flexDirection: "row",
    gap: 14,
  },
  goalColumn: {
    flex: 1,
    gap: 12,
  },
  goalItem: {
    gap: 6,
  },
  goalTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1B1B1D",
  },
  goalSubtitle: {
    fontSize: 12,
    color: "#7A7A7A",
  },
  goalProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  goalProgressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#FCEDED",
    overflow: "hidden",
  },
  goalProgressFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#FF6B6B",
  },
  goalPercent: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FF6B6B",
    minWidth: 32,
    textAlign: "right",
  },
  goalDueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  goalDueText: {
    fontSize: 12,
    color: "#7A7A7A",
  },
  eventSummaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 20,
    flexDirection: "row",
    gap: 18,
    shadowColor: "rgba(0,0,0,0.25)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
  },
  eventSummaryLeft: {
    flex: 1,
    gap: 6,
  },
  eventSummaryDay: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FF6B6B",
  },
  eventSummaryDate: {
    fontSize: 36,
    fontWeight: "700",
    color: "#1B1B1D",
  },
  eventSummaryEmpty: {
    fontSize: 14,
    color: "#444",
    marginTop: 6,
    lineHeight: 18,
  },
  eventSummaryCounter: {
    fontSize: 14,
    color: "#444",
    marginTop: 6,
    fontWeight: "600",
  },
  eventSummaryRight: {
    flex: 1.4,
    gap: 10,
  },
  eventSummaryHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "#777",
    letterSpacing: 0.4,
  },
  eventSummaryList: {
    gap: 10,
  },
  eventSummaryItem: {
    flexDirection: "row",
    gap: 10,
  },
  eventSummaryBar: {
    width: 3,
    borderRadius: 999,
    backgroundColor: "#D7D7D7",
  },
  eventSummaryItemText: {
    flex: 1,
    gap: 2,
  },
  eventSummaryTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1B1B1D",
  },
  eventSummaryMeta: {
    fontSize: 12,
    color: "#7A7A7A",
  },
  cardTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  cardTagText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  cardBodyText: {
    fontSize: 13,
    color: "#4B4B4B",
    marginTop: 10,
    lineHeight: 18,
  },
  checklist: {
    marginTop: 12,
    gap: 10,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checklistBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  checklistText: {
    fontSize: 13,
    color: "#2E2E2E",
    flex: 1,
  },
  checklistTextChecked: {
    color: "#9C9C9C",
    textDecorationLine: "line-through",
  },
  habitChecklist: {
    marginTop: 12,
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },
  habitChecklistList: {
    flex: 1,
    gap: 12,
  },
  habitRowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  habitCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "#58E27A",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  habitCircleChecked: {
    backgroundColor: "#58E27A",
    borderColor: "#58E27A",
  },
  habitTextItem: {
    fontSize: 13,
    color: "#2E2E2E",
    flex: 1,
  },
  habitTextChecked: {
    color: "#9C9C9C",
    textDecorationLine: "line-through",
  },
  habitProgress: {
    alignItems: "center",
    justifyContent: "center",
  },
  todoEmpty: {
    marginTop: 12,
    fontSize: 12,
    color: "#8C8C8C",
  },
  // Goal styles
  goalMeta: {
    marginTop: 12,
    alignItems: "center",
  },
  progressContainer: {
    marginBottom: 8,
  },
  progressCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 4,
    borderColor: "#4ECDC4",
    alignItems: "center",
    justifyContent: "center",
  },
  progressText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4ECDC4",
  },
  targetText: {
    fontSize: 12,
    color: "#666",
  },
  // Habit styles
  habitMeta: {
    marginTop: 12,
    gap: 8,
  },
  habitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  habitText: {
    fontSize: 12,
    color: "#666",
  },
  streakBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFF5F5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  streakText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FF6B6B",
  },
  // Health styles
  healthMeta: {
    marginTop: 12,
    gap: 6,
  },
  healthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  healthHeaderText: {
    flex: 1,
  },
  healthChecklist: {
    marginTop: 14,
    gap: 12,
  },
  healthChecklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  healthChecklistContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
  },
  healthTime: {
    fontSize: 12,
    color: "#1B1B1D",
    fontWeight: "700",
    minWidth: 46,
  },
  healthLabelGroup: {
    flex: 1,
  },
  healthItemText: {
    fontSize: 12,
    color: "#2E2E2E",
    fontWeight: "600",
  },
  healthItemDetail: {
    fontSize: 11,
    color: "#7A7A7A",
    marginTop: 2,
  },
  healthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  healthText: {
    fontSize: 12,
    color: "#444",
  },
  progressRingLabel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  progressRingText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1B1B1D",
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 4,
  },
  statusActive: {
    backgroundColor: "#DCFCE7",
  },
  statusPaused: {
    backgroundColor: "#FEF9C3",
  },
  statusCompleted: {
    backgroundColor: "#E0E7FF",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#333",
  },
  // Event styles
  eventMeta: {
    marginTop: 12,
    gap: 6,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  eventText: {
    fontSize: 12,
    color: "#444",
  },
  // Person styles
  personMeta: {
    marginTop: 10,
    gap: 4,
  },
  personRole: {
    fontSize: 12,
    color: "#F59E0B",
    fontWeight: "600",
  },
  personContact: {
    fontSize: 12,
    color: "#666",
  },
  // Empty state
  emptyState: {
    paddingTop: 80,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B1B1D",
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#777",
    marginTop: 6,
    textAlign: "center",
  },
});
