import { useAui, useAuiState } from "@assistant-ui/react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { memo, useMemo, useState } from "react";
import { Pressable, Text, View, type GestureResponderEvent } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { haptics } from "@/lib/haptics";
import type { AgentData } from "@/mock/protocol";
import { usePalette } from "@/theme/palette";
import { MarkdownView } from "@/components/markdown/MarkdownView";
import { PopoverMenu, type MenuAnchor } from "@/components/ui/PopoverMenu";
import { showToast } from "@/components/ui/Toast";
import { AgentCard } from "./AgentCard";
import { SelectTextModal } from "./SelectTextModal";
import { ToolCallCard, type ToolCallInfo } from "./ToolCallCard";
import { TypingIndicator } from "./TypingIndicator";

const useMessageText = (): string =>
  useAuiState((s) =>
    s.message.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text)
      .join("\n\n"),
  );

// ---------------------------------------------------------------------------
// Part segmentation: consecutive text parts merge into one markdown run;
// tool calls and agent blocks render as cards in stream order.
// ---------------------------------------------------------------------------

type Segment =
  | { kind: "md"; text: string }
  | { kind: "tool"; tool: ToolCallInfo }
  | { kind: "agent"; agent: AgentData };

type AnyPart = { type: string; [key: string]: unknown };

const buildSegments = (parts: readonly AnyPart[]): Segment[] => {
  const segments: Segment[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      const text = (part as { text?: string }).text ?? "";
      const last = segments[segments.length - 1];
      if (last?.kind === "md") last.text += `\n\n${text}`;
      else segments.push({ kind: "md", text });
    } else if (part.type === "tool-call") {
      segments.push({ kind: "tool", tool: part as unknown as ToolCallInfo });
    } else if (part.type === "data" && (part as { name?: string }).name === "agent") {
      segments.push({ kind: "agent", agent: (part as unknown as { data: AgentData }).data });
    }
  }
  return segments;
};

// ---------------------------------------------------------------------------
// Action bar (under the last assistant message)
// ---------------------------------------------------------------------------

const ActionIcon = ({
  name,
  onPress,
  active,
}: {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  active?: boolean;
}) => {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      className="h-[34px] w-[34px] items-center justify-center rounded-full active:bg-surface-high"
    >
      <Ionicons name={name} size={17} color={active ? palette.accent : palette.muted} />
    </Pressable>
  );
};

const BranchPicker = () => {
  const aui = useAui();
  const branchNumber = useAuiState((s) => s.message.branchNumber);
  const branchCount = useAuiState((s) => s.message.branchCount);
  const palette = usePalette();

  if (branchCount <= 1) return null;

  return (
    <View className="mr-1 flex-row items-center">
      <Pressable
        hitSlop={8}
        disabled={branchNumber <= 1}
        onPress={() => {
          haptics.tick();
          aui.message().switchToBranch({ position: "previous" });
        }}
        className="p-1 active:opacity-50"
        style={{ opacity: branchNumber <= 1 ? 0.35 : 1 }}
      >
        <Ionicons name="chevron-back" size={15} color={palette.muted} />
      </Pressable>
      <Text className="text-[12.5px] tabular-nums text-muted">
        {branchNumber}/{branchCount}
      </Text>
      <Pressable
        hitSlop={8}
        disabled={branchNumber >= branchCount}
        onPress={() => {
          haptics.tick();
          aui.message().switchToBranch({ position: "next" });
        }}
        className="p-1 active:opacity-50"
        style={{ opacity: branchNumber >= branchCount ? 0.35 : 1 }}
      >
        <Ionicons name="chevron-forward" size={15} color={palette.muted} />
      </Pressable>
    </View>
  );
};

const ActionBar = ({ text }: { text: string }) => {
  const aui = useAui();
  const feedback = useAuiState((s) => s.message.metadata.submittedFeedback?.type);

  const onCopy = () => {
    Clipboard.setStringAsync(text).catch(() => {});
    haptics.success();
    showToast("Copied", "checkmark");
  };

  return (
    <Animated.View entering={FadeIn.duration(220)} className="mt-1 flex-row items-center">
      <BranchPicker />
      <ActionIcon name="copy-outline" onPress={onCopy} />
      <ActionIcon
        name={feedback === "positive" ? "thumbs-up" : "thumbs-up-outline"}
        active={feedback === "positive"}
        onPress={() => {
          haptics.tick();
          aui.message().submitFeedback({ type: "positive" });
        }}
      />
      <ActionIcon
        name={feedback === "negative" ? "thumbs-down" : "thumbs-down-outline"}
        active={feedback === "negative"}
        onPress={() => {
          haptics.tick();
          aui.message().submitFeedback({ type: "negative" });
        }}
      />
      <ActionIcon
        name="refresh-outline"
        onPress={() => {
          haptics.tick();
          aui.message().reload();
        }}
      />
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

const ErrorCard = ({ error }: { error: unknown }) => {
  const aui = useAui();
  const palette = usePalette();
  const offline = error === "offline";

  return (
    <View className="mt-2 flex-row items-center gap-3 self-start rounded-2xl border border-danger/25 bg-danger/10 py-2.5 pl-3.5 pr-2">
      <Ionicons name={offline ? "cloud-offline-outline" : "alert-circle-outline"} size={17} color={palette.danger} />
      <Text className="max-w-[220px] text-[14px] leading-[19px] text-danger">
        {offline
          ? "You're offline. I'll retry when you're back."
          : typeof error === "string"
            ? error
            : "Something went wrong."}
      </Text>
      <Pressable
        onPress={() => {
          haptics.tick();
          aui.message().reload();
        }}
        className="rounded-full bg-danger px-3.5 py-1.5 active:opacity-80"
      >
        <Text className="text-[13px] font-semibold text-white">Retry</Text>
      </Pressable>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Assistant message row
// ---------------------------------------------------------------------------

export const AssistantMessage = memo(() => {
  const aui = useAui();
  const text = useMessageText();
  const parts = useAuiState((s) => s.message.parts);
  const status = useAuiState((s) =>
    s.message.role === "assistant" ? (s.message as { status: { type: string; reason?: string; error?: unknown } }).status : undefined,
  );
  const isLast = useAuiState((s) => s.message.isLast);

  const segments = useMemo(() => buildSegments(parts as readonly AnyPart[]), [parts]);

  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [selectVisible, setSelectVisible] = useState(false);

  const running = status?.type === "running";
  const failed = status?.type === "incomplete" && status.reason === "error";

  const onLongPress = (e: GestureResponderEvent) => {
    if (running || !text) return;
    haptics.press();
    const { pageX, pageY } = e.nativeEvent;
    setMenuAnchor({ x: pageX, y: pageY, width: 1, height: 1 });
  };

  return (
    <View className="px-5 py-2">
      {segments.length > 0 ? (
        <Pressable onLongPress={onLongPress} delayLongPress={320}>
          <View className="gap-3">
            {segments.map((seg, i) =>
              seg.kind === "md" ? (
                <MarkdownView key={i} text={seg.text} />
              ) : seg.kind === "tool" ? (
                <ToolCallCard key={seg.tool.toolCallId} tool={seg.tool} messageRunning={running} />
              ) : (
                <AgentCard key={seg.agent.id} agent={seg.agent} />
              ),
            )}
          </View>
        </Pressable>
      ) : running ? (
        <TypingIndicator />
      ) : null}

      {failed ? <ErrorCard error={status?.error} /> : null}
      {isLast && !running && segments.length > 0 ? <ActionBar text={text} /> : null}

      <PopoverMenu
        visible={menuAnchor !== null}
        anchor={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        width={230}
        items={[
          {
            icon: "copy-outline",
            label: "Copy",
            onPress: () => {
              Clipboard.setStringAsync(text).catch(() => {});
              haptics.success();
              showToast("Copied", "checkmark");
            },
          },
          {
            icon: "text-outline",
            label: "Select text",
            onPress: () => setSelectVisible(true),
          },
          {
            icon: "refresh-outline",
            label: "Regenerate",
            onPress: () => aui.message().reload(),
          },
        ]}
      />
      <SelectTextModal visible={selectVisible} text={text} onClose={() => setSelectVisible(false)} />
    </View>
  );
});
AssistantMessage.displayName = "AssistantMessage";
