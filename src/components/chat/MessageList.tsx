import { MessageByIndexProvider, useAui, useAuiState } from "@assistant-ui/react-native";
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { haptics } from "@/lib/haptics";
import { usePalette } from "@/theme/palette";
import { AssistantMessage } from "./AssistantMessage";
import { UserEditComposer, UserMessage } from "./UserMessage";

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<string>);

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

const RowSwitch = () => {
  const aui = useAui();
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);

  // Capture recency ONCE at mount: rows animate in only when the message was
  // just created. A reactive selector here would remount the subtree when the
  // window lapses mid-stream.
  const [animateIn] = useState(() => {
    try {
      const createdAt = aui.message().getState().createdAt;
      return Date.now() - new Date(createdAt).getTime() < 1500;
    } catch {
      return false;
    }
  });

  const inner =
    role === "user" ? (
      isEditing ? (
        <UserEditComposer />
      ) : (
        <UserMessage />
      )
    ) : role === "assistant" ? (
      <AssistantMessage />
    ) : null;

  if (animateIn) {
    return (
      <Animated.View
        entering={FadeInDown.springify().damping(26).stiffness(320).withInitialValues({
          transform: [{ translateY: 14 }],
        })}
      >
        {inner}
      </Animated.View>
    );
  }
  return <View>{inner}</View>;
};

const MessageRow = memo(
  ({ index }: { index: number }) => (
    <MessageByIndexProvider index={index}>
      <RowSwitch />
    </MessageByIndexProvider>
  ),
  (prev, next) => prev.index === next.index,
);
MessageRow.displayName = "MessageRow";

// ---------------------------------------------------------------------------
// Scroll-to-bottom pill
// ---------------------------------------------------------------------------

const ScrollToBottomButton = ({
  scrollOffset,
  onPress,
}: {
  scrollOffset: SharedValue<number>;
  onPress: () => void;
}) => {
  const palette = usePalette();

  const style = useAnimatedStyle(() => {
    const shown = scrollOffset.value > 320;
    return {
      opacity: withTiming(shown ? 1 : 0, { duration: 160 }),
      transform: [
        { translateY: withSpring(shown ? 0 : 14, { damping: 30, stiffness: 300 }) },
        { scale: withTiming(shown ? 1 : 0.8, { duration: 160 }) },
      ],
      pointerEvents: shown ? ("auto" as const) : ("none" as const),
    };
  });

  return (
    <Animated.View className="absolute bottom-3 self-center" style={style}>
      <Pressable
        onPress={onPress}
        className="h-[38px] w-[38px] items-center justify-center rounded-full border border-line bg-surface"
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Ionicons name="arrow-down" size={18} color={palette.foreground} />
      </Pressable>
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

type Props = {
  /** Optional external handle so the screen can scroll (e.g. on send). */
  listRef?: React.RefObject<FlatList<string> | null>;
};

/**
 * Inverted message list. Keyboard/composer clearance is handled by the
 * screen animating this component's container inset — content size never
 * changes for keyboard reasons, so `maintainVisibleContentPosition` only has
 * one job: keeping the reading position stable while streaming grows the
 * newest message (and pinning to bottom when near it).
 */
export const MessageList = ({ listRef: externalRef }: Props) => {
  const internalRef = useRef<FlatList<string>>(null);
  const listRef = externalRef ?? internalRef;
  const scrollOffset = useSharedValue(0);

  // Stable id list: recomputed per store tick but referentially stable while
  // membership is unchanged, so streaming tokens never re-render the list.
  const idsJoined = useAuiState((s) => s.thread.messages.map((m) => m.id).join(" "));
  const reversedIds = useMemo(
    () => (idsJoined ? idsJoined.split(" ").reverse() : []),
    [idsJoined],
  );
  const count = reversedIds.length;

  const renderItem = useCallback(
    ({ index }: { item: string; index: number }) => <MessageRow index={count - 1 - index} />,
    [count],
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollOffset.value = e.contentOffset.y;
    },
  });

  const scrollToBottom = useCallback(() => {
    haptics.tick();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [listRef]);

  return (
    <View className="flex-1">
      <AnimatedFlatList
        ref={listRef}
        data={reversedIds}
        keyExtractor={(id) => id}
        renderItem={renderItem}
        inverted
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 100 }}
        contentInsetAdjustmentBehavior="never"
        // Inverted list: flex-end anchors short conversations to the visual
        // top (frontier apps never bottom-float a short thread).
        contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end" }}
        initialNumToRender={14}
        maxToRenderPerBatch={8}
        windowSize={13}
        ListHeaderComponent={<View className="h-2.5" />}
        ListFooterComponent={<View className="h-3" />}
      />
      <ScrollToBottomButton scrollOffset={scrollOffset} onPress={scrollToBottom} />
    </View>
  );
};
