import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ScrollView,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { DrawerContentComponentProps } from "@react-navigation/drawer";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../packages/fn/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LinearGradient } from "expo-linear-gradient";
import { useDrawerContext } from "../../app/(chat)/_layout";
import { GlassIconButton, isGlassAvailable } from "./glass-surface";

const { width: screenWidth } = Dimensions.get("window");

export function ChatDrawerContent({
  navigation,
  searchText = "",
}: DrawerContentComponentProps & { searchText?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setActiveFlowNanoId, activeFlowNanoId } = useDrawerContext();
  const glassEnabled = isGlassAvailable;
  const iconTone = glassEnabled ? "#0B0B0C" : "#000";

  const renameFlow = useMutation((api as any).flows.renameFlow);
  const deleteFlow = useMutation((api as any).flows.deleteFlow);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [selectedFlow, setSelectedFlow] = useState<{
    nanoId: string;
    title?: string;
  } | null>(null);

  const flowsRaw = useQuery((api as any).flows.listByUser);
  const flows = flowsRaw || [];
  const isLoading = flowsRaw === undefined;

  const handleFlowPress = (flowNanoId: string) => {
    setActiveFlowNanoId(flowNanoId);
    router.replace({ pathname: "/(chat)", params: { flowId: flowNanoId } });
    navigation.closeDrawer();
  };

  const handleFlowLongPress = (flow: { nanoId: string; title?: string }) => {
    setSelectedFlow(flow);
    setRenameValue(flow.title || "");
    setOptionsVisible(true);
  };

  const handleRenameSubmit = async () => {
    const name = renameValue.trim();
    if (!selectedFlow || !name) return;
    try {
      await renameFlow({ flowNanoId: selectedFlow.nanoId, title: name });
      setRenameVisible(false);
      setOptionsVisible(false);
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteConfirm = () => {
    if (!selectedFlow) return;
    const targetFlowId = selectedFlow.nanoId;
    setOptionsVisible(false);
    Alert.alert("Excluir conversa?", "Esta ação não pode ser desfeita.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteFlow({ flowNanoId: targetFlowId });
            if (activeFlowNanoId === targetFlowId) {
              setActiveFlowNanoId(undefined);
              router.replace({ pathname: "/(chat)" });
            }
          } catch (error) {
            console.error(error);
          }
        },
      },
    ]);
  };

  const formatTimestamp = (date: number) => {
    const diff = Date.now() - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Hoje";
    if (days === 1) return "Ontem";
    return `${days} dias`;
  };

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredFlows = normalizedSearch
    ? flows.filter((flow: any) =>
        String(flow.title || "Nova Conversa")
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : flows;

  const leftFlows = filteredFlows.filter((_: any, i: number) => i % 2 === 0);
  const rightFlows = filteredFlows.filter((_: any, i: number) => i % 2 !== 0);

  const renderCard = (item: any, _index: number, _isRightColumn: boolean) => (
    <Pressable
      key={item.nanoId}
      style={({ pressed }) => [
        styles.card,
        pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
      ]}
      onPress={() => handleFlowPress(item.nanoId)}
      onLongPress={() => handleFlowLongPress(item)}
    >
      <View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title || "Nova Conversa"}
        </Text>
        <Text style={styles.cardPreview} numberOfLines={3}>
          Procurando emails dos remanecentes hisotircos da taxa absia para ter
          certeza...
        </Text>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.cardTimestamp}>
          {formatTimestamp(item.updatedAt || item._creationTime)}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <LinearGradient
      colors={["#FFF4EB", "#F6F9FF", "#F4F4F4"]}
      locations={[0.24, 0.53, 0.63]}
      style={styles.container}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: insets.top + 70 },
        ]}
      >
        <View style={styles.masonryContainer}>
          <View style={styles.column}>
            {leftFlows.map((t: any, i: number) => renderCard(t, i, false))}
          </View>
          <View style={styles.column}>
            {rightFlows.map((t: any, i: number) => renderCard(t, i, true))}
          </View>
        </View>

        {flows.length === 0 && !isLoading && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Sem conversas ainda</Text>
          </View>
        )}
      </ScrollView>

      {/* Floating Absolute Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <GlassIconButton
            style={styles.headerIconButton}
            fallbackStyle={styles.headerIconFallback}
            glassStyle={styles.headerIconGlass}
            onPress={() => router.push("/settings-modal" as any)}
          >
            <Ionicons name="settings-outline" size={24} color={iconTone} />
          </GlassIconButton>
          <View style={{ flex: 1 }} />
          <GlassIconButton
            style={styles.headerIconButton}
            fallbackStyle={styles.headerIconFallback}
            glassStyle={styles.headerIconGlass}
            onPress={() => navigation.closeDrawer()}
          >
            <Ionicons
              name="chevron-forward-outline"
              size={24}
              color={iconTone}
            />
          </GlassIconButton>
        </View>
      </View>

      <Modal
        visible={optionsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOptionsVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setOptionsVisible(false)}
        >
          <View style={styles.modalCard}>
            <Pressable
              style={styles.modalOption}
              onPress={() => {
                setOptionsVisible(false);
                setRenameVisible(true);
              }}
            >
              <Text style={styles.modalOptionText}>Renomear</Text>
            </Pressable>
            <Pressable
              style={[styles.modalOption, styles.modalOptionDanger]}
              onPress={handleDeleteConfirm}
            >
              <Text
                style={[styles.modalOptionText, styles.modalOptionDangerText]}
              >
                Excluir
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={renameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setRenameVisible(false)}
        >
          <View style={styles.renameCard}>
            <Text style={styles.renameTitle}>Renomear conversa</Text>
            <TextInput
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Nome da conversa"
              placeholderTextColor="#8E8E93"
              autoFocus
            />
            <View style={styles.renameActions}>
              <Pressable
                style={styles.renameButton}
                onPress={() => setRenameVisible(false)}
              >
                <Text style={styles.renameButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.renameButton,
                  !renameValue.trim() && styles.renameButtonDisabled,
                ]}
                onPress={handleRenameSubmit}
                disabled={!renameValue.trim()}
              >
                <Text style={styles.renameButtonText}>Salvar</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    zIndex: 200,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerIconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  headerIconFallback: {
    backgroundColor: "rgba(255, 255, 255, 1)",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  headerIconGlass: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
    boxShadow: "0 14px 30px rgba(15, 23, 42, 0.16)",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  masonryContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  column: {
    width: "48.5%",
    alignItems: "stretch",
  },
  card: {
    width: "100%",
    backgroundColor: "#FFF",
    borderRadius: 28, // Rounder for extra scale
    padding: 20, // Increased from 16
    minHeight: 180,
    marginBottom: 16,
    justifyContent: "space-between",
    elevation: 4,
    shadowColor: "rgba(0,0,0,0.3)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  cardTitle: {
    fontSize: 17, // Increased from 14
    fontWeight: "700",
    color: "#1A1A1A",
    lineHeight: 22,
  },
  cardPreview: {
    fontSize: 14, // Increased from 11
    color: "#8A8A8E",
    lineHeight: 19,
    marginTop: 8,
  },
  cardFooter: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  cardTimestamp: {
    fontSize: 12, // Increased from 10
    color: "#AAA",
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    paddingTop: 60,
    alignItems: "center",
  },
  emptyText: {
    color: "#999",
    fontSize: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingVertical: 6,
    borderCurve: "continuous",
  },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  modalOptionDanger: {
    borderTopWidth: 1,
    borderTopColor: "#EFEFF0",
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  modalOptionDangerText: {
    color: "#FF3B30",
  },
  renameCard: {
    width: "100%",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 16,
    gap: 12,
    borderCurve: "continuous",
  },
  renameTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  renameInput: {
    borderWidth: 1,
    borderColor: "#ECEDEF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1C1C1E",
  },
  renameActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  renameButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  renameButtonDisabled: {
    opacity: 0.5,
  },
  renameButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1C1C1E",
  },
});
