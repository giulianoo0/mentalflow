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
import { api } from "../../../../packages/fn/convex/_generated/api";

const { width: screenWidth } = Dimensions.get("window");
const horizontalPadding = 16;
const cardGap = 14;
const contentWidth = screenWidth - horizontalPadding * 2;
const compactMinWidth = contentWidth * 0.36;
const wideMinWidth = contentWidth * 0.58;

type WidgetType = "task" | "person" | "event" | "note" | "goal" | "habit" | "health";

interface Widget {
  nanoId: string;
  type: WidgetType;
  title: string;
  description?: string;
  data: {
    dueDate?: number;
    priority?: "high" | "medium" | "low";
    isCompleted?: boolean;
    person?: { role?: string; contactInfo?: string; avatarUrl?: string };
    event?: { startsAt?: number; endsAt?: number; location?: string };
    habit?: { frequency?: "daily" | "weekly"; streak?: number };
    health?: { dosage?: string; schedule?: string; status?: "active" | "paused" | "completed" };
    goal?: { targetValue?: number; progress?: number };
    relatedTitles?: string[];
    relatedTitlesCompleted?: boolean[];
  };
}

interface WidgetDrawerProps {
  flowNanoId: string | undefined;
  onClose?: () => void;
}

export function WidgetDrawer({ flowNanoId, onClose }: WidgetDrawerProps) {
  console.log("[WidgetDrawer] Render with flowNanoId:", flowNanoId);
  const insets = useSafeAreaInsets();
  const widgets = useQuery(
    api.widgets.listByFlow,
    flowNanoId ? { flowNanoId } : "skip",
  );

  console.log("[WidgetDrawer] Query result:", widgets ? `found ${widgets.length} widgets` : "loading/skip");

  const widgetCards: Widget[] = widgets || [];

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
        <View style={styles.grid}>
          {widgetCards.map((widget) => (
            <WidgetCard key={widget.nanoId} widget={widget} />
          ))}
        </View>

        {widgetCards.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Sem widgets ainda</Text>
            <Text style={styles.emptySubtitle}>
              Envie uma mensagem para extrair ideias, metas e pessoas.
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.header, { paddingTop: insets.top + 14 }]}
        pointerEvents="box-none"
      >
        <LinearGradient
          colors={["#FFF4EB", "rgba(255, 244, 235, 0.75)", "transparent"]}
          locations={[0, 0.2, 1]}
          style={[StyleSheet.absoluteFill, { height: insets.top + 100 }]}
        />
        <View style={styles.headerRow}>
          <Pressable style={styles.iconButton} onPress={onClose}>
            <Ionicons name="chevron-forward" size={22} color="#222" />
          </Pressable>

          <View style={styles.iconPill}>
            <Ionicons name="cloud-outline" size={18} color="#444" />
            <Ionicons name="chatbubble-ellipses-outline" size={18} color="#444" />
            <Ionicons name="stats-chart-outline" size={18} color="#444" />
          </View>

          <Pressable style={styles.iconButton}>
            <Ionicons name="sparkles-outline" size={20} color="#222" />
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}

function WidgetCard({ widget }: { widget: Widget }) {
  const updateChecklist = useMutation(api.widgets.updateRelatedTitlesCompletion);
  const data = widget.data || {};
  const isTask = widget.type === "task";
  const isGoal = widget.type === "goal";
  const isHabit = widget.type === "habit";
  const isHealth = widget.type === "health";
  const isEvent = widget.type === "event";
  const isPerson = widget.type === "person";
  const isNote = widget.type === "note";

  const typeLabels: Record<WidgetType, string> = {
    task: "TODO",
    goal: "Meta",
    habit: "Hábito",
    health: "Saúde",
    event: "Evento",
    person: "Pessoa",
    note: "Nota",
  };

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
  const hasHealthChecklist = isHealth && relatedTitles.length > 0;
  const hasTodoList = isTask && todoItems.length > 0;
  const checklistItems = hasHealthChecklist ? relatedTitles : hasTodoList ? todoItems : [];
  const hasChecklist = checklistItems.length > 0;
  const initialChecked = React.useMemo(() => {
    if (!hasChecklist) return [] as boolean[];
    const saved = Array.isArray(data.relatedTitlesCompleted)
      ? data.relatedTitlesCompleted
      : [];
    if (saved.length === checklistItems.length) return saved;
    return checklistItems.map(() => false);
  }, [checklistItems, data.relatedTitlesCompleted, hasChecklist]);
  const [checkedItems, setCheckedItems] = React.useState<boolean[]>(initialChecked);
  const checklistSignature = React.useMemo(
    () => `${widget.nanoId}:${checklistItems.join("|")}`,
    [widget.nanoId, checklistItems],
  );

  React.useEffect(() => {
    if (!hasChecklist) return;
    setCheckedItems((prev) =>
      checklistItems.map((_, index) => prev[index] ?? initialChecked[index] ?? false),
    );
  }, [checklistSignature, hasChecklist, checklistItems, initialChecked]);

  const totalItems = hasChecklist ? checklistItems.length : 0;
  const completedItems = hasChecklist
    ? checkedItems.filter(Boolean).length
    : 0;
  const pendingItems = totalItems - completedItems;
  const progressPercent = totalItems > 0
    ? Math.round((completedItems / totalItems) * 100)
    : 0;
  const checklistAccent = isHealth ? "#4AA9FF" : typeColors[widget.type];
  const isWideCard =
    (isHealth && hasHealthChecklist) ||
    (isTask && hasTodoList && todoItems.length >= 4);
  const cardFlexBasis = isWideCard ? wideMinWidth : compactMinWidth;

  const shouldShowDescription =
    !!widget.description && !isTask && !(isHealth && hasHealthChecklist);

  return (
    <View style={[styles.card, { flexBasis: cardFlexBasis, flexGrow: 1 }]}> 
      {(isHealth && hasHealthChecklist) ? (
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
      ) : isTask ? (
        <View style={styles.todoHeader}>
          <Text style={styles.cardTitle}>{widget.title}</Text>
          <View style={[styles.cardTag, { backgroundColor: `${typeColors.task}15` }]}>
            <Text style={[styles.cardTagText, { color: typeColors.task }]}>TODO</Text>
          </View>
        </View>
      ) : (
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{widget.title}</Text>
          <View style={[styles.cardTag, { backgroundColor: `${typeColors[widget.type]}15` }]}> 
            <Text style={[styles.cardTagText, { color: typeColors[widget.type] }]}>
              {typeLabels[widget.type]}
            </Text>
          </View>
        </View>
      )}

      {shouldShowDescription ? (
        <Text style={styles.cardBodyText}>{widget.description}</Text>
      ) : null}

      {(isTask && hasTodoList) && (
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

      {/* Habit display with streak */}
      {isHabit && (
        <View style={styles.habitMeta}>
          {data.habit?.frequency && (
            <View style={styles.habitRow}>
              <Ionicons name="repeat-outline" size={14} color="#A855F7" />
              <Text style={styles.habitText}>
                {data.habit.frequency === "daily" ? "Diário" : "Semanal"}
              </Text>
            </View>
          )}
          {data.habit?.streak !== undefined && (
            <View style={styles.streakBadge}>
              <Ionicons name="flame" size={14} color="#FF6B6B" />
              <Text style={styles.streakText}>{data.habit.streak}</Text>
            </View>
          )}
        </View>
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
                  {time ? (
                    <Text style={styles.healthTime}>{time}</Text>
                  ) : null}
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
            <View style={[
              styles.statusBadge,
              data.health.status === "active" && styles.statusActive,
              data.health.status === "paused" && styles.statusPaused,
              data.health.status === "completed" && styles.statusCompleted,
            ]}>
              <Text style={styles.statusText}>
                {data.health.status === "active" ? "Ativo" :
                  data.health.status === "paused" ? "Pausado" : "Concluído"}
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
              <Text style={styles.eventText}>{formatDateTime(data.event.startsAt)}</Text>
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
    </View>
  );
}

function formatDateTime(value?: number) {
  if (!value) return "Sem data";
  const date = new Date(value);
  return `${date.getDate()}/${date.getMonth() + 1} ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
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
