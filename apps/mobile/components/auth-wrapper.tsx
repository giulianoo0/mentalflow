import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { Redirect } from "expo-router";

interface AuthenticatedOnlyProps {
    children: React.ReactNode;
}

/**
 * Wrapper component that protects routes requiring authentication.
 * Uses Convex's declarative auth components instead of useEffect for cleaner code.
 */
export function AuthenticatedOnly({ children }: AuthenticatedOnlyProps) {
    return (
        <>
            <AuthLoading>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#FF8800" />
                </View>
            </AuthLoading>
            <Unauthenticated>
                <Redirect href="/onboarding" />
            </Unauthenticated>
            <Authenticated>
                {children}
            </Authenticated>
        </>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F5F3F0',
    },
});
