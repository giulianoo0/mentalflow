import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    withSpring,
    FadeIn,
    FadeOut,
    SlideInRight,
    Easing,
    interpolate,
    Extrapolation,
    SharedValue,
    useFrameCallback,
    useDerivedValue,
    cancelAnimation,
} from 'react-native-reanimated';
import {
    Canvas,
    RoundedRect,
    LinearGradient as SkiaGradient,
    vec,
    Rect,
    Skia,
    Path,
} from '@shopify/react-native-skia';
import { VoiceSessionStatus } from '../../hooks/useVoiceSession';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface VoiceRecordingBarProps {
    elapsedTime: number;        // seconds
    audioLevel: number;         // 0-1 normalized
    aiAudioLevel: number;        // 0-1 normalized AI speech
    isSpeaking: boolean;
    isMuted: boolean;
    status: VoiceSessionStatus;
    onGenerate: () => void;
    onKeyboardPress: () => void;
    onMuteToggle: () => void;
    onClose: () => void;
}

// Format seconds to M:SS (e.g. 0:03)
const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const BAR_WIDTH = 2;
const BAR_GAP = 2;
const BAR_COUNT = 60;
const CANVAS_HEIGHT = 24; // Reverted back to 24

const ScrollingWaveform = ({
    audioLevel,
    aiAudioLevel,
    isSpeaking,
    status
}: {
    audioLevel: number,
    aiAudioLevel: number,
    isSpeaking: boolean,
    status: VoiceSessionStatus
}) => {
    const [width, setWidth] = useState(0);
    // Shared values for the spectrum and audio levels
    const spectrum = useSharedValue(new Array(BAR_COUNT).fill(0));
    const audioLevelShared = useSharedValue(0);
    const aiAudioLevelShared = useSharedValue(0);
    const isSpeakingShared = useSharedValue(false);
    const statusShared = useSharedValue<VoiceSessionStatus>(status);
    const skeletonOpacity = useSharedValue(0.3);

    // Trigger shared value to force the derived path to update every frame
    const pulse = useSharedValue(0);

    // Sync props to shared values
    useEffect(() => {
        audioLevelShared.value = audioLevel;
        aiAudioLevelShared.value = aiAudioLevel;
        isSpeakingShared.value = isSpeaking;
        statusShared.value = status;
    }, [audioLevel, aiAudioLevel, isSpeaking, status]);

    // Track the last update on the UI thread
    const lastUpdate = useSharedValue(0);

    // UI thread loop for array manipulation
    const frameCallback = useFrameCallback((frameInfo) => {
        // High reactivity: Update every ~32ms (30fps)
        const now = frameInfo.timestamp;
        if (now - lastUpdate.value < 32) return;
        lastUpdate.value = now;

        pulse.value = (pulse.value + 1) % 1000;

        const speaking = isSpeakingShared.value;
        const rawLevel = Math.max(audioLevelShared.value, aiAudioLevelShared.value);

        // NO ripple or idle pattern. 
        // Only reacts if rawLevel > 0. Otherwise stays perfectly flat.
        const baseLevel = (speaking || rawLevel > 0.01)
            ? Math.min(1.0, rawLevel * 3.0)
            : 0;

        // Shift values
        const currentData = spectrum.value;
        const newSpectrum = new Array(BAR_COUNT);
        for (let i = 1; i < BAR_COUNT; i++) {
            newSpectrum[i] = currentData[i - 1];
        }
        newSpectrum[0] = Math.max(0, baseLevel);
        spectrum.value = newSpectrum;
    });

    // Start/Stop animation and perform cleanup
    useEffect(() => {
        frameCallback.setActive(true);

        return () => {
            frameCallback.setActive(false);
            // Cancel all animations
            cancelAnimation(skeletonOpacity);
            cancelAnimation(pulse);
            // Reset spectrum
            spectrum.value = new Array(BAR_COUNT).fill(0);
        };
    }, []); // Only run on mount/unmount to prevent spectrum resets

    // Handle status changes (skeleton animation)
    useEffect(() => {
        if (status === 'connecting') {
            skeletonOpacity.value = withRepeat(
                withTiming(0.6, { duration: 800, easing: Easing.inOut(Easing.ease) }),
                -1,
                true
            );
        } else {
            // Cancel any running animation before setting new value
            'worklet';
            cancelAnimation(skeletonOpacity);
            skeletonOpacity.value = 0.3;
        }
    }, [status]);

    const totalWaveformWidth = BAR_COUNT * (BAR_WIDTH + BAR_GAP);

    // This derived value is the core of the motion. 
    const spectrumPath = useDerivedValue(() => {
        const _ = pulse.value; // Access pulse.value to trigger re-evaluation
        const path = Skia.Path.Make();
        if (width <= 0) return path;

        const isConnecting = statusShared.value === 'connecting';
        const currentData = spectrum.value;
        const startX = Math.max(0, (width / 2) - (totalWaveformWidth / 2));

        for (let i = 0; i < currentData.length; i++) {
            // Bars near the center are slightly amplified to emphasize the waveform core
            const centerFactor = 1 - Math.abs(i - BAR_COUNT / 2) / (BAR_COUNT / 2);
            const level = isConnecting
                ? 0.15 + 0.1 * Math.sin(i * 0.5) // Static wavy skeleton 
                : currentData[i] * (0.8 + 0.4 * centerFactor);

            const h = interpolate(level, [0, 1], [4, CANVAS_HEIGHT], Extrapolation.CLAMP);
            const y = (CANVAS_HEIGHT - h) / 2;
            const x = startX + i * (BAR_WIDTH + BAR_GAP);

            path.addRRect(
                Skia.RRectXY(
                    Skia.XYWHRect(x, y, BAR_WIDTH, h),
                    1,
                    1
                )
            );
        }

        return path;
    });

    const spectrumColor = useDerivedValue(() => {
        return statusShared.value === 'connecting' ? "#666666" : "#4AA9FF";
    });

    const isConnecting = status === 'connecting';

    const animatedSkeletonStyle = useAnimatedStyle(() => ({
        opacity: skeletonOpacity.value
    }));

    return (
        <View
            style={styles.waveformWrapper}
            onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        >
            {width > 0 && (
                <View style={{ width, height: CANVAS_HEIGHT }}>
                    <Animated.View style={[StyleSheet.absoluteFill, isConnecting ? animatedSkeletonStyle : { opacity: 1 }]}>
                        <Canvas style={{ flex: 1 }}>
                            {/* Main spectrum bars */}
                            <Path path={spectrumPath} color={spectrumColor} />

                            {/* Edge Gradients - Skia version for smooth blending */}
                            <Rect x={0} y={0} width={70} height={CANVAS_HEIGHT}>
                                <SkiaGradient
                                    start={vec(0, 0)}
                                    end={vec(70, 0)}
                                    colors={['#2A2A2A', 'rgba(42, 42, 42, 0)']}
                                />
                            </Rect>
                            <Rect x={width - 70} y={0} width={70} height={CANVAS_HEIGHT}>
                                <SkiaGradient
                                    start={vec(width - 70, 0)}
                                    end={vec(width, 0)}
                                    colors={['rgba(42, 42, 42, 0)', '#2A2A2A']}
                                />
                            </Rect>
                        </Canvas>
                    </Animated.View>
                </View>
            )}
        </View>
    );
};

export function VoiceRecordingBar({
    elapsedTime,
    audioLevel,
    aiAudioLevel,
    isSpeaking,
    isMuted,
    status,
    onGenerate,
    onKeyboardPress,
    onMuteToggle,
    onClose,
}: VoiceRecordingBarProps) {
    const isConnecting = status === 'connecting';

    return (
        <View style={styles.container}>
            {/* Left Section: Mic Toggle / Timer */}
            <View style={styles.leftControls}>
                {isConnecting ? (
                    <ActivityIndicator size="small" color="#4AA9FF" style={{ width: 22 }} />
                ) : (
                    <Pressable onPress={onMuteToggle}>
                        <Ionicons
                            name={isMuted ? "mic-off" : "mic"}
                            size={22}
                            color="#FFFFFF"
                        />
                    </Pressable>
                )}
                <Text style={[styles.timerText, isConnecting && { color: '#666' }]}>
                    {isConnecting ? "0:00" : formatTime(elapsedTime)}
                </Text>
            </View>

            {/* Center Section: Scrolling Waveform with Gradients */}
            <ScrollingWaveform
                audioLevel={audioLevel}
                aiAudioLevel={aiAudioLevel}
                isSpeaking={isSpeaking}
                status={status}
            />

            {/* Right Section: Close Button */}
            <Pressable style={styles.closeButton} onPress={onClose}>
                <View style={styles.closeCircle}>
                    <Ionicons name="close" size={20} color="#FF3B30" />
                </View>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#2A2A2A',
        borderRadius: 25,
        paddingHorizontal: 16,
        paddingVertical: 10,
        height: 50, // Reverted to 50
        gap: 12,
    },
    closeButton: {
        padding: 4,
    },
    closeCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 59, 48, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    waveformWrapper: {
        flex: 1,
        height: 30,
        position: 'relative',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    waveformContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        width: '100%',
    },
    waveformBar: {
        width: 1.5,
        borderRadius: 1,
        backgroundColor: '#4AA9FF',
    },
    edgeGradientLeft: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: -5,
        width: 70,
        zIndex: 2,
    },
    edgeGradientRight: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: -5,
        width: 70,
        zIndex: 2,
    },
    leftControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minWidth: 80,
        justifyContent: 'flex-start',
    },
    timerText: {
        fontSize: 18,
        fontWeight: '400',
        color: '#FFFFFF',
        fontVariant: ['tabular-nums'],
    },
});
