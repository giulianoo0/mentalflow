import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface MessageBubbleProps {
    text: string;
    isUser: boolean;
    timestamp: Date;
    isStreaming?: boolean;
    isLoading?: boolean;
}

export function MessageBubble({ text, isUser, timestamp, isStreaming, isLoading }: MessageBubbleProps) {
    // Skeleton animation
    const opacity = React.useRef(new Animated.Value(0.3)).current;

    React.useEffect(() => {
        if (isLoading) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(opacity, {
                        toValue: 0.7,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                    Animated.timing(opacity, {
                        toValue: 0.3,
                        duration: 800,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        }
    }, [isLoading]);

    return (
        <View style={[
            styles.container,
            isUser ? styles.userContainer : styles.aiContainer
        ]}>
            {!isUser && (
                <View style={styles.avatar}>
                    <Text>🧠</Text>
                </View>
            )}

            <View style={[
                styles.bubble,
                isUser ? styles.userBubble : styles.aiBubble
            ]}>
                {isUser ? (
                    <LinearGradient
                        colors={['#FF8800', '#FF4D00']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                ) : null}

                <Text style={[
                    styles.text,
                    isUser ? styles.userText : styles.aiText
                ]}>
                    {isLoading ? (
                        <Animated.View style={{ width: 120, height: 16, backgroundColor: isUser ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.1)', borderRadius: 8, opacity }} />
                    ) : (
                        <>
                            {text}
                            {isStreaming && <Text style={styles.cursor}>|</Text>}
                        </>
                    )}
                </Text>

                <Text style={[
                    styles.timestamp,
                    isUser ? styles.userTimestamp : styles.aiTimestamp
                ]}>
                    {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        marginBottom: 16,
        maxWidth: '85%',
    },
    userContainer: {
        alignSelf: 'flex-end',
        justifyContent: 'flex-end',
    },
    aiContainer: {
        alignSelf: 'flex-start',
        justifyContent: 'flex-start',
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    bubble: {
        padding: 12,
        borderRadius: 20,
        minWidth: 60,
        overflow: 'hidden',
    },
    userBubble: {
        borderBottomRightRadius: 4,
    },
    aiBubble: {
        backgroundColor: '#FFFFFF',
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    text: {
        fontSize: 16,
        lineHeight: 24,
    },
    userText: {
        color: '#FFFFFF',
    },
    aiText: {
        color: '#1F2937',
    },
    timestamp: {
        fontSize: 10,
        marginTop: 4,
        alignSelf: 'flex-end',
    },
    userTimestamp: {
        color: 'rgba(255, 255, 255, 0.7)',
    },
    aiTimestamp: {
        color: '#9CA3AF',
    },
    cursor: {
        color: '#FF8800',
        fontWeight: 'bold',
    },
});
