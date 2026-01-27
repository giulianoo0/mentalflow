import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  FlatList,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { GlassIconButton, GlassSurface } from "@/components/chat/glass-surface";
import { useAudioPlayer } from "expo-audio";
import {
  DEFAULT_VOICE_ID,
  VOICE_OPTIONS,
  type VoiceOption,
  type VoiceOptionId,
} from "@/hooks/useVoiceSession";
import { api } from "../../../packages/fn/convex/_generated/api";

export default function SettingsModal() {
  const router = useRouter();
  const voicePreference = useQuery((api as any).voice.getVoicePreference);
  const setVoicePreference = useMutation((api as any).voice.setVoicePreference);
  const [isVoiceModalVisible, setIsVoiceModalVisible] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] =
    useState<VoiceOptionId>(DEFAULT_VOICE_ID);
  const [voiceIndex, setVoiceIndex] = useState(0);
  const voiceListRef = useRef<FlatList<VoiceOption>>(null);
  const screenWidth = Dimensions.get("window").width;
  const audioPlayer = useAudioPlayer(null);
  const voiceSamples = useMemo(
    () => ({
      giuliano: require("../assets/giuliano.wav"),
      minelli: require("../assets/minelli.wav"),
      marcos: require("../assets/marquinhos.wav"),
      nataly: require("../assets/nataly.wav"),
      leticia: require("../assets/leticia.wav"),
    }),
    [],
  );

  useEffect(() => {
    if (voicePreference) {
      setSelectedVoiceId(voicePreference as VoiceOptionId);
    }
  }, [voicePreference]);

  useEffect(() => {
    if (!isVoiceModalVisible) return;
    const index = Math.max(
      0,
      VOICE_OPTIONS.findIndex((voice) => voice.id === selectedVoiceId),
    );
    setVoiceIndex(index);
    setTimeout(() => {
      voiceListRef.current?.scrollToOffset({
        offset: index * screenWidth,
        animated: false,
      });
    }, 0);
  }, [isVoiceModalVisible, selectedVoiceId, screenWidth]);

  const playSample = useCallback(
    (voiceId: VoiceOptionId) => {
      const source = voiceSamples[voiceId];
      if (!source) return;
      audioPlayer.pause();
      audioPlayer.replace(source);
      audioPlayer.seekTo(0).catch(() => undefined);
      audioPlayer.play();
    },
    [audioPlayer, voiceSamples],
  );

  useEffect(() => {
    if (!isVoiceModalVisible) {
      audioPlayer.pause();
      return;
    }
    const voice = VOICE_OPTIONS[voiceIndex];
    if (!voice) return;
    playSample(voice.id);
  }, [audioPlayer, isVoiceModalVisible, voiceIndex, playSample]);

  const selectedVoice = useMemo(() => {
    return (
      VOICE_OPTIONS.find((voice) => voice.id === selectedVoiceId) ??
      VOICE_OPTIONS[0]
    );
  }, [selectedVoiceId]);

  const handleVoiceScrollEnd = (event: any) => {
    const nextIndex = Math.round(
      event.nativeEvent.contentOffset.x / screenWidth,
    );
    const nextVoice = VOICE_OPTIONS[nextIndex];
    if (nextVoice) {
      setVoiceIndex(nextIndex);
      if (nextVoice.id !== selectedVoiceId) {
        setSelectedVoiceId(nextVoice.id);
      }
      playSample(nextVoice.id);
    }
  };

  const handleVoiceConfirm = () => {
    setVoicePreference({ voiceId: selectedVoiceId }).catch(console.error);
    setIsVoiceModalVisible(false);
  };

  const accountItems = [
    {
      icon: "mail-outline",
      label: "E-mail",
      value: "minelli.neto95@gmail.com",
    },
    {
      icon: "call-outline",
      label: "Numero de telefone",
      value: "+5581989416868",
    },
    {
      icon: "card-outline",
      label: "Assinatura",
      value: "Plano Gratis",
    },
    {
      icon: "sparkles-outline",
      label: "Faca upgrade para o mentalflow Plus",
    },
  ];

  const personalizationItems = [
    { icon: "color-palette-outline", label: "Aparencia", value: "Sistema" },
    {
      icon: "language-outline",
      label: "Idioma do aplicativo",
      value: "portugues",
    },
    { icon: "mic-outline", label: "Idioma da fala", value: "Autodetectar" },
    {
      icon: "musical-notes-outline",
      label: "Voz",
      value: selectedVoice.label,
      action: "voice",
    },
  ];

  const aboutItems = [
    { icon: "bug-outline", label: "Informar bug" },
    { icon: "sparkles-outline", label: "Solicitar melhoria" },
    { icon: "document-text-outline", label: "Termos de uso" },
    { icon: "lock-closed-outline", label: "Politica de privacidade" },
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.sheet}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={styles.scrollContent}
          stickyHeaderIndices={[0]}
        >
          <View>
            <View style={styles.sheetHeader}>
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  transform: [{ translateX: 36 * 0.5 }],
                }}
              >
                <View style={styles.titlePill}>
                  <GlassSurface style={StyleSheet.absoluteFill} />
                  <Text style={styles.sheetTitle} selectable>
                    Configurações
                  </Text>
                </View>
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

          <View style={styles.profileSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText} selectable>
                PI
              </Text>
            </View>
            <Text style={styles.profileName} selectable>
              pitelneto
            </Text>
            <Text style={styles.profileHandle} selectable>
              pitelneto
            </Text>
            <Pressable style={styles.profileButton}>
              <Text style={styles.profileButtonText} selectable>
                Editar perfil
              </Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle} selectable>
              Conta
            </Text>
            <View style={styles.sectionCard}>
              {accountItems.map((item, index) => (
                <View
                  key={item.label}
                  style={[
                    styles.row,
                    index < accountItems.length - 1 && styles.rowDivider,
                  ]}
                >
                  <Ionicons name={item.icon as any} size={18} color="#1C1C1E" />
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel} selectable>
                      {item.label}
                    </Text>
                    {item.value ? (
                      <Text style={styles.rowValue} selectable>
                        {item.value}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle} selectable>
              Personalizacao
            </Text>
            <View style={styles.sectionCard}>
              {personalizationItems.map((item, index) => {
                const rowStyle = [
                  styles.row,
                  index < personalizationItems.length - 1 && styles.rowDivider,
                ];
                const content = (
                  <>
                    <Ionicons
                      name={item.icon as any}
                      size={18}
                      color="#1C1C1E"
                    />
                    <View style={styles.rowText}>
                      <Text style={styles.rowLabel} selectable>
                        {item.label}
                      </Text>
                      <Text style={styles.rowValue} selectable>
                        {item.value}
                      </Text>
                    </View>
                  </>
                );

                if (item.action === "voice") {
                  return (
                    <Pressable
                      key={item.label}
                      style={rowStyle}
                      onPress={() => setIsVoiceModalVisible(true)}
                    >
                      {content}
                    </Pressable>
                  );
                }

                return (
                  <View key={item.label} style={rowStyle}>
                    {content}
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle} selectable>
              Sobre
            </Text>
            <View style={styles.sectionCard}>
              {aboutItems.map((item, index) => (
                <View
                  key={item.label}
                  style={[
                    styles.row,
                    index < aboutItems.length - 1 && styles.rowDivider,
                  ]}
                >
                  <Ionicons name={item.icon as any} size={18} color="#1C1C1E" />
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel} selectable>
                      {item.label}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <Pressable style={styles.signOutRow}>
            <Ionicons name="log-out-outline" size={18} color="#FF3B30" />
            <Text style={styles.signOutText} selectable>
              Sair
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      <Modal
        visible={isVoiceModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsVoiceModalVisible(false)}
      >
        <View style={styles.voiceModalScreen}>
          <View style={styles.voiceCarousel}>
            <View style={styles.voiceCarouselContent}>
              <FlatList
                ref={voiceListRef}
                data={VOICE_OPTIONS}
                keyExtractor={(item) => item.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleVoiceScrollEnd}
                contentContainerStyle={styles.voiceListContent}
                style={styles.voiceList}
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.voiceSlide, { width: screenWidth }]}
                    onPress={() => playSample(item.id)}
                  >
                    <View style={styles.voiceSlideContent}>
                      <Text style={styles.voiceName} selectable>
                        {item.label}
                      </Text>
                      <Text style={styles.voiceDescription} selectable>
                        {item.description}
                      </Text>
                    </View>
                  </Pressable>
                )}
              />
              <View style={styles.voiceDots}>
                {VOICE_OPTIONS.map((voice, index) => (
                  <View
                    key={voice.id}
                    style={[
                      styles.voiceDot,
                      index === voiceIndex && styles.voiceDotActive,
                    ]}
                  />
                ))}
              </View>
            </View>
          </View>

          <Pressable
            style={styles.voiceDoneButton}
            onPress={handleVoiceConfirm}
          >
            <Text style={styles.voiceDoneText} selectable>
              Pronto
            </Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F6F8",
  },
  sheet: {
    flex: 1,
    backgroundColor: "#F7F6F8",
  },
  sheetHeader: {
    paddingTop: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  titlePill: {
    borderRadius: 1000,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    borderCurve: "continuous",
    overflow: "hidden",
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  closeButtonFallback: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderCurve: "continuous",
  },
  scrollContent: {
    paddingBottom: 12,
    paddingHorizontal: 20,
    gap: 22,
  },
  profileSection: {
    alignItems: "center",
    gap: 10,
    paddingTop: 16,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#324158",
    alignItems: "center",
    justifyContent: "center",
    borderCurve: "continuous",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "600",
  },
  profileName: {
    fontSize: 19,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  profileHandle: {
    fontSize: 13,
    color: "#8E8E93",
  },
  profileButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#ECECEF",
    borderRadius: 12,
    borderCurve: "continuous",
  },
  profileButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#3A3A3C",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#5A5A5F",
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderCurve: "continuous",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#ECEDEF",
  },
  rowText: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLabel: {
    fontSize: 14,
    color: "#1C1C1E",
    fontWeight: "500",
  },
  rowValue: {
    fontSize: 13,
    color: "#8E8E93",
  },
  signOutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderCurve: "continuous",
  },
  signOutText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FF3B30",
  },
  voiceModalScreen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingTop: 72,
    paddingBottom: 24,
  },
  voiceCarousel: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  voiceCarouselContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  voiceSlide: {
    alignItems: "center",
    justifyContent: "center",
    height: 110,
  },
  voiceSlideContent: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 24,
  },
  voiceName: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  voiceDescription: {
    fontSize: 13,
    color: "#8E8E93",
  },
  voiceDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  voiceList: {
    flexGrow: 0,
    height: 110,
  },
  voiceListContent: {
    alignItems: "center",
  },
  voiceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#D1D1D6",
  },
  voiceDotActive: {
    backgroundColor: "#1C1C1E",
  },
  voiceDoneButton: {
    marginHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: "#0B0B0C",
    alignItems: "center",
  },
  voiceDoneText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
