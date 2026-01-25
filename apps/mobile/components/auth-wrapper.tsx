import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useConvexAuth, useQuery } from "convex/react";
import { Redirect } from "expo-router";
import { api } from "../../../packages/fn/convex/_generated/api";

interface AuthenticatedOnlyProps {
  children: React.ReactNode;
}

/**
 * Wrapper component that protects routes requiring authentication.
 */
export function AuthenticatedOnly({ children }: AuthenticatedOnlyProps) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(
    (api as any).users.getCurrentUser,
    isAuthenticated ? {} : "skip",
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF8800" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/onboarding" />;
  }

  if (user === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF8800" />
      </View>
    );
  }

  if (!user?.completed_onboarding_at) {
    return <Redirect href="/onboarding" />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F3F0",
  },
});
