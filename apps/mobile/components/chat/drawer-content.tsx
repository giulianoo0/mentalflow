import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Dimensions,
  ScrollView,
} from "react-native";
import { DrawerContentComponentProps } from "@react-navigation/drawer";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../../packages/fn/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LinearGradient } from "expo-linear-gradient";
import { LAYOUT } from "../../constants/layout";

const { width: screenWidth } = Dimensions.get("window");

export function ChatDrawerContent(props: DrawerContentComponentProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [searchText, setSearchText] = useState("");

  const threadsRaw = useQuery((api as any).chat.listThreads);
  const threads = threadsRaw || [];
  const isLoading = threadsRaw === undefined;

  const handleThreadPress = (threadId: string) => {
    router.push({ pathname: "/(chat)", params: { threadId } });
    props.navigation.closeDrawer();
  };

  const handleNewChat = () => {
    router.push({ pathname: "/(chat)", params: { threadId: undefined } });
    props.navigation.closeDrawer();
  };

  const formatTimestamp = (date: number) => {
    const diff = Date.now() - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Hoje";
    if (days === 1) return "Ontem";
    return `${days} dias`;
  };

  const getStableRandomHeight = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Even larger scale: 180-260
    return 180 + (Math.abs(hash) % 81);
  };

  const leftThreads = threads.filter((_: any, i: number) => i % 2 === 0);
  const rightThreads = threads.filter((_: any, i: number) => i % 2 !== 0);

  const renderCard = (item: any, _index: number, _isRightColumn: boolean) => (
    <Pressable
      key={item._id}
      style={({ pressed }) => [
        styles.card,
        { minHeight: getStableRandomHeight(item._id) },
        pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
      ]}
      onPress={() => handleThreadPress(item._id)}
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
          {formatTimestamp(item._creationTime)}
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
            {leftThreads.map((t: any, i: number) => renderCard(t, i, false))}
          </View>
          <View style={styles.column}>
            {rightThreads.map((t: any, i: number) => renderCard(t, i, true))}
          </View>
        </View>

        {threads.length === 0 && !isLoading && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Sem conversas ainda</Text>
          </View>
        )}
      </ScrollView>

      {/* Floating Absolute Header with Gentle Fade */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <LinearGradient
          colors={["#FFF4EB", "rgba(255, 244, 235, 0.8)", "transparent"]}
          locations={[0, 0.1, 1]}
          style={[StyleSheet.absoluteFill, { height: insets.top + 90 }]}
        />
        <View style={styles.headerRow}>
          <Pressable style={styles.headerIconButton}>
            <Ionicons name="person-outline" size={24} color="#000" />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            style={styles.headerIconButton}
            onPress={() => props.navigation.closeDrawer()}
          >
            <Ionicons name="chevron-forward-outline" size={24} color="#000" />
          </Pressable>
        </View>
      </View>

      <KeyboardStickyView
        offset={{ closed: 0, opened: 8 }}
        style={styles.bottomStickyWrapper}
      >
        <View
          style={[
            styles.bottomContainer,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <LinearGradient
            colors={["transparent", "rgba(255, 255, 255, 0.8)", "#FFFFFF"]}
            locations={[0, 0.5, 1]}
            style={[StyleSheet.absoluteFill, { top: -40 }]} // Start fade slightly above
          />
          <View style={styles.bottomRow}>
            <View style={styles.searchBarWrapper}>
              <Ionicons name="search-outline" size={24} color="#999" />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar..."
                placeholderTextColor="#999"
                value={searchText}
                onChangeText={setSearchText}
                returnKeyType="search"
              />
            </View>

            <Pressable onPress={handleNewChat} style={styles.newChatIconButton}>
              <View style={styles.newChatIconContent}>
                <Ionicons name="add" size={30} color="#FFF" />
              </View>
            </Pressable>
          </View>
        </View>
      </KeyboardStickyView>
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
    width: LAYOUT.BUTTON_SIZE,
    height: LAYOUT.BUTTON_SIZE,
    borderRadius: LAYOUT.BUTTON_SIZE / 2,
    backgroundColor: "rgba(255, 255, 255, 1)",
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 160,
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
  bottomStickyWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  bottomContainer: {
    paddingHorizontal: 12,
    paddingTop: 16, // Reduced since LinearGradient handles the fade area
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 2, // Stay above the gradient background
  },
  searchBarWrapper: {
    flex: 1,
    height: LAYOUT.INPUT_HEIGHT,
    backgroundColor: "#FFF",
    borderRadius: LAYOUT.INPUT_HEIGHT / 2,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16, // Slighly bigger text
    color: "#1A1A1A",
    height: "100%",
  },
  newChatIconButton: {
    width: LAYOUT.BUTTON_SIZE,
    height: LAYOUT.BUTTON_SIZE,
    borderRadius: LAYOUT.BUTTON_SIZE / 2,
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  newChatIconContent: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "black",
    alignItems: "center",
  },
});
