import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';

const { width, height } = Dimensions.get('window');

interface OnboardingScreenProps {
    onContinueWithGoogle?: () => void;
}

export function OnboardingScreen({ onContinueWithGoogle }: OnboardingScreenProps) {
    return (
        <View style={styles.container}>
            {/* Subtle radial gradient overlay */}
            <View style={styles.radialGradientContainer}>
                <LinearGradient
                    colors={['rgba(255, 140, 50, 0)', 'rgba(255, 140, 50, 0.12)', 'rgba(255, 140, 50, 0.12)', 'rgba(255, 140, 50, 0)']}
                    locations={[0, 0.3, 0.7, 1]}
                    style={styles.radialGradient}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                />
            </View>

            <View style={styles.content}>
                <Text style={styles.welcomeText}>Bem vindo ao</Text>

                <MaskedView
                    style={styles.maskedView}
                    maskElement={
                        <Text style={styles.logoText}>mentalflow</Text>
                    }
                >
                    <LinearGradient
                        colors={['#FF8800', '#FF4D00']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.gradientBackground}
                    />
                </MaskedView>

                <Text style={styles.subtitle}>
                    Organize Seus Pensamentos{'\n'}Alcance Seus Objetivos
                </Text>
            </View>

            <View style={styles.buttonContainer}>
                <Pressable
                    style={({ pressed }) => [
                        styles.button,
                        pressed && styles.buttonPressed,
                    ]}
                    onPress={onContinueWithGoogle}
                >
                    <Text style={styles.buttonText}>Continuar com Google</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F3F0',
    },
    radialGradientContainer: {
        position: 'absolute',
        top: height * 0.25,
        left: 0,
        right: 0,
        height: height * 0.4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radialGradient: {
        width: width,
        height: height * 0.5,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 36,
        paddingTop: height * 0.18,
    },
    welcomeText: {
        fontFamily: 'Inter',
        fontWeight: '600',
        fontSize: 28,
        color: '#9CA3AF',
        textAlign: 'center',
        marginBottom: 8,
    },
    maskedView: {
        height: 80,
        width: width - 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoText: {
        fontFamily: 'Inter',
        fontWeight: '600',
        fontSize: 64,
        textAlign: 'center',
    },
    gradientBackground: {
        flex: 1,
        width: '100%',
    },
    subtitle: {
        fontFamily: 'Inter',
        fontWeight: '500',
        fontSize: 18,
        lineHeight: 28,
        color: '#9CA3AF',
        textAlign: 'center',
        marginTop: 16,
    },
    buttonContainer: {
        paddingHorizontal: 36,
        paddingBottom: 50,
        width: '100%',
    },
    button: {
        backgroundColor: '#000000',
        borderRadius: 36,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    buttonPressed: {
        opacity: 0.8,
    },
    buttonText: {
        fontFamily: 'Inter',
        fontWeight: '600',
        fontSize: 17,
        color: '#FFFFFF',
        textAlign: 'center',
        letterSpacing: -0.3,
    },
});
