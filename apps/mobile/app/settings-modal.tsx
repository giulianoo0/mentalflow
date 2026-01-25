import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { GlassIconButton, GlassSurface } from "@/components/chat/glass-surface";

export default function SettingsModal() {
  const router = useRouter();

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
    { icon: "musical-notes-outline", label: "Voz", value: "Breeze" },
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
                    Configuracoes
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
              {personalizationItems.map((item, index) => (
                <View
                  key={item.label}
                  style={[
                    styles.row,
                    index < personalizationItems.length - 1 &&
                      styles.rowDivider,
                  ]}
                >
                  <Ionicons name={item.icon as any} size={18} color="#1C1C1E" />
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel} selectable>
                      {item.label}
                    </Text>
                    <Text style={styles.rowValue} selectable>
                      {item.value}
                    </Text>
                  </View>
                </View>
              ))}
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
});
