import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Redirect, useRouter } from "expo-router";
import { openAuthSessionAsync } from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { OnboardingScreen } from "@/components/onboarding-screen";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { api } from "../../../packages/fn/convex/_generated/api";

// Create redirect URI using expo-auth-session for proper handling
const redirectTo = makeRedirectUri({ scheme: "mobile" });

export default function Onboarding() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(
    (api as any).users.getCurrentUser,
    isAuthenticated ? {} : "skip",
  );
  const completeOnboarding = useMutation((api as any).users.completeOnboarding);

  const handleContinueWithGoogle = async () => {
    console.log("🔵 handleContinueWithGoogle called");
    console.log("🔵 redirectTo:", redirectTo);

    try {
      // Call signIn to get the OAuth URL
      const { redirect } = await signIn("google", { redirectTo });
      console.log("🔵 redirect:", redirect);

      // On web, the redirect happens automatically
      if (Platform.OS === "web") {
        return;
      }

      if (redirect) {
        // Open the OAuth URL in the browser
        console.log("🔵 Opening auth session...");
        const result = await openAuthSessionAsync(
          redirect.toString(),
          redirectTo,
        );
        console.log("🔵 Auth session result:", result);

        // Handle the successful redirect - extract the code and complete sign-in
        if (result.type === "success") {
          const { url } = result;
          const code = new URL(url).searchParams.get("code");
          console.log("🔵 Auth code received:", code);

          if (code) {
            // Complete the sign-in by calling signIn with the code
            console.log("🔵 Completing sign-in with code...");
            await signIn("google", { code, redirectTo });
            console.log("🔵 Sign-in completed!");
            router.replace("/(chat)" as const);
          }
        }
      }
    } catch (error) {
      console.error("🔴 Sign in error:", error);
    }
  };

  const handleOnboardingComplete = async () => {
    await completeOnboarding({});
    router.replace("/(chat)" as const);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF8800" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <OnboardingScreen onContinueWithGoogle={handleContinueWithGoogle} />;
  }

  if (user === undefined) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF8800" />
      </View>
    );
  }

  if (!user?.completed_onboarding_at) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  return <Redirect href={"/(chat)" as const} />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F3F0",
  },
});
