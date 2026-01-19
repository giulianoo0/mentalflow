import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, Unauthenticated } from "convex/react";
import { Redirect } from 'expo-router';
import { openAuthSessionAsync } from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { Platform } from 'react-native';
import { OnboardingScreen } from '@/components/onboarding-screen';

// Create redirect URI using expo-auth-session for proper handling
const redirectTo = makeRedirectUri({ scheme: 'mobile' });

export default function Onboarding() {
    const { signIn } = useAuthActions();

    const handleContinueWithGoogle = async () => {
        console.log('🔵 handleContinueWithGoogle called');
        console.log('🔵 redirectTo:', redirectTo);

        try {
            // Call signIn to get the OAuth URL
            const { redirect } = await signIn("google", { redirectTo });
            console.log('🔵 redirect:', redirect);

            // On web, the redirect happens automatically
            if (Platform.OS === "web") {
                return;
            }

            if (redirect) {
                // Open the OAuth URL in the browser
                console.log('🔵 Opening auth session...');
                const result = await openAuthSessionAsync(redirect.toString(), redirectTo);
                console.log('🔵 Auth session result:', result);

                // Handle the successful redirect - extract the code and complete sign-in
                if (result.type === 'success') {
                    const { url } = result;
                    const code = new URL(url).searchParams.get('code');
                    console.log('🔵 Auth code received:', code);

                    if (code) {
                        // Complete the sign-in by calling signIn with the code
                        console.log('🔵 Completing sign-in with code...');
                        await signIn("google", { code });
                        console.log('🔵 Sign-in completed!');
                    }
                }
            }
        } catch (error) {
            console.error('🔴 Sign in error:', error);
        }
    };

    return (
        <>
            <Authenticated>
                <Redirect href={'/(chat)' as const} />
            </Authenticated>
            <Unauthenticated>
                <OnboardingScreen onContinueWithGoogle={handleContinueWithGoogle} />
            </Unauthenticated>
        </>
    );
}
