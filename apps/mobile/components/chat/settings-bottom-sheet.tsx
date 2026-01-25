import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet, Group, RNHostView } from "@expo/ui/swift-ui";
import {
  presentationDetents,
  presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";

type SettingsBottomSheetProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const SettingsBottomSheet = ({
  isOpen,
  onOpenChange,
}: SettingsBottomSheetProps) => {
  const insets = useSafeAreaInsets();

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
    <BottomSheet isPresented={isOpen} onIsPresentedChange={onOpenChange}>
      <Group
        modifiers={[
          presentationDetents(["large"]),
          presentationDragIndicator("hidden"),
        ]}
      >
        <RNHostView>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle} selectable>
                Configuracoes
              </Text>
              <Pressable
                onPress={() => onOpenChange(false)}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Ionicons name="close" size={18} color="#1C1C1E" />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentInsetAdjustmentBehavior="automatic"
              contentContainerStyle={styles.scrollContent}
            >
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
                      <Ionicons
                        name={item.icon as any}
                        size={18}
                        color="#1C1C1E"
                      />
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
                      <Ionicons
                        name={item.icon as any}
                        size={18}
                        color="#1C1C1E"
                      />
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
        </RNHostView>
      </Group>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: "#F7F6F8",
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  closeButton: {
    position: "absolute",
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderCurve: "continuous",
  },
  scrollContent: {
    paddingBottom: 24,
    gap: 22,
  },
  profileSection: {
    alignItems: "center",
    gap: 10,
    paddingTop: 20,
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

export { SettingsBottomSheet };
