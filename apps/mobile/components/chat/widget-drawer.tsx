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
import { useQuery } from "convex/react";
import { api } from "../../../../packages/fn/convex/_generated/api";

const { width: screenWidth } = Dimensions.get("window");
const cardWidth = (screenWidth - 16 * 2 - 14) / 2;

interface WidgetDrawerProps {
  flowNanoId: string | undefined;
  onClose?: () => void;
}

export function WidgetDrawer({ flowNanoId, onClose }: WidgetDrawerProps) {
  const insets = useSafeAreaInsets();
  const widgets = useQuery(
    (api as any).widgets.listByFlow,
    flowNanoId ? { flowNanoId } : "skip",
  );

  const widgetCards = widgets || [];
  const leftCards = widgetCards.filter((_: any, i: number) => i % 2 === 0);
  const rightCards = widgetCards.filter((_: any, i: number) => i % 2 !== 0);

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
        <View style={styles.masonryContainer}>
          <View style={styles.column}>
            {leftCards.map((widget: any) => (
              <WidgetCard key={widget.nanoId} widget={widget} />
            ))}
          </View>
          <View style={styles.column}>
            {rightCards.map((widget: any) => (
              <WidgetCard key={widget.nanoId} widget={widget} />
            ))}
          </View>
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

function WidgetCard({ widget }: { widget: any }) {
  const data = widget.data || {};
  const isTask = widget.type === "task";
  const isPerson = widget.type === "person";
  const isEvent = widget.type === "event";

  return (
    <View style={[styles.card, { width: cardWidth }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{widget.title}</Text>
        <View style={styles.cardTag}>
          <Text style={styles.cardTagText}>{widget.type}</Text>
        </View>
      </View>

      {widget.description ? (
        <Text style={styles.cardBodyText}>{widget.description}</Text>
      ) : null}

      {isTask && (
        <View style={styles.taskMeta}>
          <View style={styles.taskRow}>
            <View style={styles.taskDot} />
            <Text style={styles.taskLabel}>Prazo</Text>
            <Text style={styles.taskValue}>
              {formatDate(data.dueDate)}
            </Text>
          </View>
          <View style={styles.taskRow}>
            <View style={[styles.taskDot, styles.taskDotAccent]} />
            <Text style={styles.taskLabel}>Prioridade</Text>
            <Text style={styles.taskValue}>{data.priority || "media"}</Text>
          </View>
        </View>
      )}

      {isPerson && (
        <View style={styles.inlineList}>
          {data.person?.role && (
            <Text style={styles.inlineText}>{data.person.role}</Text>
          )}
          {data.person?.contactInfo && (
            <Text style={styles.inlineText}>{data.person.contactInfo}</Text>
          )}
        </View>
      )}

      {isEvent && (
        <View style={styles.inlineList}>
          <Text style={styles.inlineText}>
            {formatDate(data.event?.startsAt)}
          </Text>
          {data.event?.location && (
            <Text style={styles.inlineText}>{data.event.location}</Text>
          )}
        </View>
      )}
    </View>
  );
}

function formatDate(value?: number) {
  if (!value) return "Sem data";
  const date = new Date(value);
  return `${date.getDate()}/${date.getMonth() + 1}`;
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
  masonryContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  column: {
    gap: 14,
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
    backgroundColor: "#F2F4F7",
  },
  cardTagText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
  },
  cardBodyText: {
    fontSize: 13,
    color: "#4B4B4B",
    marginTop: 10,
    lineHeight: 18,
  },
  taskMeta: {
    marginTop: 12,
    gap: 8,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  taskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E0E0E0",
  },
  taskDotAccent: {
    backgroundColor: "#FF5A5F",
  },
  taskLabel: {
    fontSize: 12,
    color: "#8C8C8C",
  },
  taskValue: {
    fontSize: 12,
    color: "#1B1B1D",
    fontWeight: "600",
  },
  inlineList: {
    marginTop: 10,
    gap: 6,
  },
  inlineText: {
    fontSize: 12,
    color: "#444",
  },
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
