import { useAui, useAuiState } from "@assistant-ui/react-native";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatHeader } from "@/components/chat/ChatHeader";
import { Composer } from "@/components/chat/Composer";
import { EmptyThread } from "@/components/chat/EmptyThread";
import { MessageList } from "@/components/chat/MessageList";
import { OfflineBanner } from "@/components/chat/OfflineBanner";
import { queueStore } from "@/state/queueStore";
import { usePalette } from "@/theme/palette";

export default function ChatScreen() {
  const { id, prompt, then } = useLocalSearchParams<{
    id: string;
    prompt?: string;
    then?: string;
  }>();
  const aui = useAui();
  const insets = useSafeAreaInsets();
  const palette = usePalette();

  const isEmpty = useAuiState((s) => s.thread.isEmpty);
  const isLoading = useAuiState((s) => s.thread.isLoading);

  // "new" routes get a fresh thread — but only when the current main thread
  // already has content (switching away from an empty new thread is a no-op).
  useEffect(() => {
    if (id !== "new") return;
    const state = aui.threads().getState();
    if (state.mainThreadId !== state.newThreadId) {
      aui.threads().switchToNewThread();
    }
  }, [id, aui]);

  // Deep-link prompts (punch://chat/new?prompt=...) send immediately, like a
  // share-sheet intent — queueing if a run is already active. An optional
  // `then` param queues a follow-up a few seconds later (demo driver for the
  // queue-while-agent-works flow).
  const sentPromptRef = useRef<string | null>(null);
  useEffect(() => {
    if (!prompt || sentPromptRef.current === prompt) return;
    sentPromptRef.current = prompt;
    const timers = [
      setTimeout(() => {
        if (aui.thread().getState().isRunning) queueStore.add(prompt);
        else aui.thread().append(prompt);
      }, 350),
    ];
    if (then) {
      timers.push(
        setTimeout(() => {
          if (aui.thread().getState().isRunning) queueStore.add(then);
          else aui.thread().append(then);
        }, 4200),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [prompt, then, aui]);

  const { height: keyboardHeight, progress: keyboardProgress } =
    useReanimatedKeyboardAnimation();
  const composerHeight = useSharedValue(96);
  const listRef = useRef<FlatList<string>>(null);

  // The content body sits above the composer + keyboard. Animating the
  // container inset (not the list content) keeps the scroll anchor honest.
  const bodyStyle = useAnimatedStyle(() => ({
    bottom:
      composerHeight.value +
      Math.max(0, -keyboardHeight.value - keyboardProgress.value * insets.bottom),
  }));

  return (
    <View className="flex-1 bg-background">
      <ChatHeader />
      <View className="flex-1">
        <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0 }, bodyStyle]}>
          {isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={palette.muted} />
            </View>
          ) : isEmpty ? (
            <EmptyThread />
          ) : (
            <MessageList listRef={listRef} />
          )}
        </Animated.View>
        <OfflineBanner />
        <Composer
          keyboardHeight={keyboardHeight}
          keyboardProgress={keyboardProgress}
          composerHeight={composerHeight}
          onSend={() => {
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
          }}
        />
      </View>
    </View>
  );
}
