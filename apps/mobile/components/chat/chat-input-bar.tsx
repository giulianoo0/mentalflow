import React, { useEffect, useState } from 'react';
import {
    View,
    TextInput,
    Pressable,
    StyleSheet,
    Text,
    Platform,
    Keyboard,
    useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { LAYOUT } from '../../constants/layout';
import MaskedView from '@react-native-masked-view/masked-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    interpolate,
    Extrapolation,
    Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { VoiceRecordingBar } from './voice-recording-bar';
import { VoiceSessionStatus } from '../../hooks/useVoiceSession';

// Custom easing: cubic-bezier(0.22, 1, 0.36, 1) - easeOutExpo feel
const customEasing = Easing.bezier(0.22, 1, 0.36, 1);
const ANIMATION_DURATION = 350;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface ChatInputBarProps {
    value: string;
    onChangeText: (text: string) => void;
    onSend: () => void;
    onVoicePress?: () => void;
    placeholder?: string;
    // Voice session props
    isVoiceActive?: boolean;
    voiceElapsedTime?: number;
    voiceAudioLevel?: number;
    voiceAiAudioLevel?: number;
    voiceIsSpeaking?: boolean;
    voiceIsMuted?: boolean;
    voiceStatus?: VoiceSessionStatus;
    onVoiceGenerate?: () => void;
    onVoiceMuteToggle?: () => void;
    onVoiceClose?: () => void;
}

export function ChatInputBar({
    value,
    onChangeText,
    onSend,
    onVoicePress,
    placeholder = 'Mensagem...',
    isVoiceActive = false,
    voiceElapsedTime = 0,
    voiceAudioLevel = 0,
    voiceAiAudioLevel = 0,
    voiceIsSpeaking = false,
    voiceIsMuted = false,
    voiceStatus = 'idle',
    onVoiceGenerate,
    onVoiceMuteToggle,
    onVoiceClose,
}: ChatInputBarProps) {
    const insets = useSafeAreaInsets();
    const { width: screenWidth } = useWindowDimensions();
    const inputRef = React.useRef<TextInput>(null);
    const canSend = value.trim().length > 0;

    // State for expansion based on keyboard
    const isExpanded = useSharedValue(0);
    const [isKeyboardVisible, setIsKeyboardVisible] = React.useState(false);
    const [contentHeight, setContentHeight] = React.useState(100);

    // Internal button size
    const INTERNAL_BUTTON_SIZE = 42;
    const internalButtonWidth = useSharedValue(canSend ? INTERNAL_BUTTON_SIZE : 90);
    const backgroundButtonWidth = useSharedValue(canSend ? LAYOUT.BUTTON_SIZE : 90);

    // Morphing button animation values
    const COLLAPSED_WIDTH = 90;
    const LEFT_SPACING = 16; // Spacing from left screen edge when expanded
    const FULL_WIDTH = screenWidth - 12 - LEFT_SPACING; // From right inset to left margin
    const morphingWidth = useSharedValue(COLLAPSED_WIDTH);

    useEffect(() => {
        const showSub = Keyboard.addListener('keyboardWillShow', () => {
            isExpanded.value = withTiming(1, { duration: ANIMATION_DURATION, easing: customEasing });
            setIsKeyboardVisible(true);
        });
        const hideSub = Keyboard.addListener('keyboardWillHide', () => {
            isExpanded.value = withTiming(0, { duration: ANIMATION_DURATION, easing: customEasing });
            setIsKeyboardVisible(false);
            inputRef.current?.blur();
        });

        const showSubDid = Keyboard.addListener('keyboardDidShow', () => {
            isExpanded.value = withTiming(1, { duration: ANIMATION_DURATION, easing: customEasing });
            setIsKeyboardVisible(true);
        });
        const hideSubDid = Keyboard.addListener('keyboardDidHide', () => {
            isExpanded.value = withTiming(0, { duration: ANIMATION_DURATION, easing: customEasing });
            setIsKeyboardVisible(false);
            inputRef.current?.blur();
        });

        return () => {
            showSub.remove();
            hideSub.remove();
            showSubDid.remove();
            hideSubDid.remove();
        };
    }, []);

    // Animate morphing button width when voice active changes
    useEffect(() => {
        morphingWidth.value = withTiming(
            isVoiceActive ? FULL_WIDTH : COLLAPSED_WIDTH,
            { duration: ANIMATION_DURATION, easing: customEasing }
        );
    }, [isVoiceActive, FULL_WIDTH]);

    const expandedInputWidth = screenWidth - 24 + 4;
    const bottomInset = Math.max(insets.bottom, 12);

    const wrapperAnimatedStyle = useAnimatedStyle(() => {
        const currentCollapsedWidth = screenWidth - 24 - backgroundButtonWidth.value - 10;
        const width = interpolate(isExpanded.value, [0, 1], [currentCollapsedWidth, expandedInputWidth]);
        const height = interpolate(isExpanded.value, [0, 1], [LAYOUT.INPUT_HEIGHT, contentHeight]);
        const borderRadius = interpolate(isExpanded.value, [0, 1], [LAYOUT.INPUT_HEIGHT / 2, 24]);

        return {
            width,
            height,
            borderRadius,
            bottom: 0,
            zIndex: isExpanded.value > 0.1 ? 50 : 10,
        };
    });

    const inputAnimatedStyle = useAnimatedStyle(() => {
        const paddingTop = interpolate(isExpanded.value, [0, 1], [6, 12]);
        const paddingLeft = interpolate(isExpanded.value, [0, 1], [LAYOUT.BUTTON_SIZE, 16]);
        const paddingRight = interpolate(isExpanded.value, [0, 1], [12, 16]);
        const expandedInputHeight = contentHeight - 40; // Adjusted for better internal alignment

        return {
            paddingTop,
            paddingLeft,
            paddingRight,
            height: interpolate(isExpanded.value, [0, 1], [LAYOUT.INPUT_HEIGHT, expandedInputHeight]),
        };
    });

    const plusButtonAnimatedStyle = useAnimatedStyle(() => {
        const bottomPosition = contentHeight - 56;
        const top = interpolate(isExpanded.value, [0, 1], [0, bottomPosition]);
        const left = interpolate(isExpanded.value, [0, 1], [0, 12]);

        return {
            top,
            left,
            width: LAYOUT.BUTTON_SIZE,
            height: LAYOUT.BUTTON_SIZE,
        };
    });

    const internalFaleButtonAnimatedStyle = useAnimatedStyle(() => {
        return {
            opacity: interpolate(isExpanded.value, [0.8, 1], [0, 1], Extrapolation.CLAMP),
            transform: [{ scale: interpolate(isExpanded.value, [0.8, 1], [0.8, 1], Extrapolation.CLAMP) }],
            width: internalButtonWidth.value,
        };
    });

    useEffect(() => {
        internalButtonWidth.value = withTiming(canSend ? INTERNAL_BUTTON_SIZE : 90, { duration: ANIMATION_DURATION, easing: customEasing });
        backgroundButtonWidth.value = withTiming(canSend ? LAYOUT.BUTTON_SIZE : 90, { duration: ANIMATION_DURATION, easing: customEasing });
    }, [canSend]);

    const handleContentSizeChange = (event: any) => {
        const newHeight = event.nativeEvent.contentSize.height;
        const calculatedHeight = Math.min(Math.max(newHeight + 50, 100), 200);
        setContentHeight(calculatedHeight);
    };

    const handleSend = () => {
        Keyboard.dismiss();
        onSend();
    };

    const backgroundButtonAnimatedStyle = useAnimatedStyle(() => {
        return {
            width: backgroundButtonWidth.value,
            opacity: interpolate(isExpanded.value, [0, 0.3], [1, 0], Extrapolation.CLAMP),
        };
    });

    // Morphing button style - width animates from collapsed to full
    const morphingButtonStyle = useAnimatedStyle(() => {
        return {
            width: morphingWidth.value,
            bottom: 0,
            height: LAYOUT.INPUT_HEIGHT,
        };
    });

    // Fale content fades out as button expands
    const faleContentStyle = useAnimatedStyle(() => {
        const progress = interpolate(
            morphingWidth.value,
            [COLLAPSED_WIDTH, COLLAPSED_WIDTH + 60],
            [1, 0],
            Extrapolation.CLAMP
        );
        return {
            opacity: progress,
            transform: [{ scale: progress }],
        };
    });

    // Voice content fades in as button expands
    const voiceContentStyle = useAnimatedStyle(() => {
        const progress = interpolate(
            morphingWidth.value,
            [FULL_WIDTH - 80, FULL_WIDTH],
            [0, 1],
            Extrapolation.CLAMP
        );
        return {
            opacity: progress,
        };
    });

    // Input wrapper fades out when voice is active
    const inputFadeStyle = useAnimatedStyle(() => {
        const progress = interpolate(
            morphingWidth.value,
            [COLLAPSED_WIDTH, COLLAPSED_WIDTH + 40],
            [1, 0],
            Extrapolation.CLAMP
        );
        return {
            opacity: progress,
            transform: [{ scale: interpolate(progress, [0, 1], [0.98, 1]) }],
        };
    });

    return (
        <KeyboardStickyView offset={{ closed: 0, opened: 8 }}>
            <View style={[styles.outerContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                {/* Background Blur */}
                <View style={styles.blurContainer}>
                    <MaskedView
                        style={StyleSheet.absoluteFill}
                        maskElement={
                            <LinearGradient
                                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,1)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 0, y: 0.6 }}
                                style={StyleSheet.absoluteFill}
                            />
                        }
                    >
                        <BlurView intensity={25} tint="light" style={StyleSheet.absoluteFill} />
                    </MaskedView>
                </View>

                {/* Main Content Row */}
                <View style={styles.contentRow}>
                    {/* Input Wrapper - Fades out when voice active */}
                    <Animated.View
                        style={[
                            styles.expandingInputWrapper,
                            wrapperAnimatedStyle,
                            inputFadeStyle,
                        ]}
                        pointerEvents={isVoiceActive ? 'none' : 'auto'}
                    >
                        {/* Invisible pressable overlay when collapsed */}
                        {!isKeyboardVisible && !isVoiceActive && (
                            <Pressable
                                style={[StyleSheet.absoluteFill, { right: 100 }]}
                                onPress={() => inputRef.current?.focus()}
                            />
                        )}

                        {/* Plus Button */}
                        <AnimatedPressable style={[styles.plusButton, plusButtonAnimatedStyle]}>
                            <Ionicons name="add" size={30} color="#999" />
                        </AnimatedPressable>

                        {/* Text Input */}
                        <AnimatedTextInput
                            ref={inputRef}
                            style={[styles.textInput, inputAnimatedStyle]}
                            value={value}
                            onChangeText={onChangeText}
                            onContentSizeChange={handleContentSizeChange}
                            placeholder={isKeyboardVisible ? 'Pergunte alguma coisa' : placeholder}
                            placeholderTextColor="#999"
                            multiline
                            textAlignVertical={isKeyboardVisible ? 'top' : 'center'}
                        />

                        {/* Internal Fale/Send Button */}
                        <AnimatedPressable
                            style={[styles.internalFaleButton, internalFaleButtonAnimatedStyle]}
                            onPress={canSend ? handleSend : onVoicePress}
                        >
                            <LinearGradient
                                colors={['black', 'black']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.internalFaleContent}
                            >
                                {canSend ? (
                                    <Ionicons name="arrow-up" size={24} color="#FFF" />
                                ) : (
                                    <>
                                        <Ionicons name="mic-outline" size={18} color="#FFF" />
                                        <Text style={styles.faleText}>Fale</Text>
                                    </>
                                )}
                            </LinearGradient>
                        </AnimatedPressable>
                    </Animated.View>

                    {/* Morphing Fale Button - Expands into Voice Player */}
                    <Animated.View style={[styles.morphingButton, morphingButtonStyle]}>
                        {/* Fale Button Content - Fades out */}
                        <Animated.View style={[styles.faleContentWrapper, faleContentStyle]}>
                            <Pressable
                                style={styles.faleButtonInner}
                                onPress={onVoicePress}
                                disabled={isVoiceActive}
                            >
                                <Ionicons name="mic-outline" size={18} color="#FFF" />
                                <Text style={styles.faleText}>Fale</Text>
                            </Pressable>
                        </Animated.View>

                        <Animated.View
                            style={[styles.voiceContentWrapper, voiceContentStyle]}
                            pointerEvents={isVoiceActive ? 'auto' : 'none'}
                        >
                            <VoiceRecordingBar
                                elapsedTime={voiceElapsedTime || 0}
                                audioLevel={voiceAudioLevel || 0}
                                aiAudioLevel={voiceAiAudioLevel || 0}
                                isSpeaking={voiceIsSpeaking || false}
                                isMuted={voiceIsMuted || false}
                                status={voiceStatus || 'idle'}
                                onGenerate={onVoiceGenerate || (() => { })}
                                onKeyboardPress={() => {
                                    onVoiceClose?.();
                                    setTimeout(() => inputRef.current?.focus(), 100);
                                }}
                                onMuteToggle={onVoiceMuteToggle || (() => { })}
                                onClose={onVoiceClose || (() => { })}
                            />
                        </Animated.View>
                    </Animated.View>
                </View>

            </View>
        </KeyboardStickyView>
    );
}

const styles = StyleSheet.create({
    outerContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 12,
        paddingTop: 8,
    },
    blurContainer: {
        ...StyleSheet.absoluteFillObject,
        top: -60,
    },
    contentRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        minHeight: LAYOUT.INPUT_HEIGHT,
        gap: 10,
    },
    expandingInputWrapper: {
        position: 'absolute',
        left: 0,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#e0e0e0',
        overflow: 'hidden',
        shadowColor: "rgba(0,0,0,0.4)",
        elevation: 1,
    },
    plusButton: {
        position: 'absolute',
        width: LAYOUT.BUTTON_SIZE,
        height: LAYOUT.BUTTON_SIZE,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    textInput: {
        width: '100%',
        color: '#1A1A1A',
        fontSize: 16,
    },
    internalFaleButton: {
        position: 'absolute',
        right: 12,
        bottom: 4,
        height: 42,
        borderRadius: 21,
        overflow: 'hidden',
    },
    internalFaleContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    faleText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 17,
    },
    morphingButton: {
        position: 'absolute',
        right: 0,
        backgroundColor: '#2A2A2A',
        borderRadius: LAYOUT.INPUT_HEIGHT / 2,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#2A2A2A', // Same border width as input for alignment
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    faleContentWrapper: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    faleButtonInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        width: '100%',
        height: '100%',
    },
    voiceContentWrapper: {
        ...StyleSheet.absoluteFillObject,
    },
});
