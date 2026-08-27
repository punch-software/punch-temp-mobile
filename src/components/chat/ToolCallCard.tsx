import { Ionicons } from "@expo/vector-icons";
import { memo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";

import { haptics } from "@/lib/haptics";
import { MONO_FONT } from "@/components/markdown/MarkdownView";
import { usePalette } from "@/theme/palette";

type ToolMeta = {
  icon: keyof typeof Ionicons.glyphMap;
  running: string;
  done: string;
  subtitle?: (args: Record<string, unknown>) => string | undefined;
};

const TOOL_META: Record<string, ToolMeta> = {
  web_search: {
    icon: "globe-outline",
    running: "Searching the web",
    done: "Searched the web",
    subtitle: (args) => (typeof args.query === "string" ? `“${args.query}”` : undefined),
  },
  fetch_page: {
    icon: "document-text-outline",
    running: "Reading page",
    done: "Read page",
    subtitle: (args) => {
      if (typeof args.url !== "string") return undefined;
      try {
        return new URL(args.url).hostname.replace(/^www\./, "");
      } catch {
        return args.url;
      }
    },
  },
  get_weather: {
    icon: "partly-sunny-outline",
    running: "Checking the weather",
    done: "Checked the weather",
    subtitle: (args) => (typeof args.location === "string" ? args.location : undefined),
  },
};

const metaFor = (name: string): ToolMeta =>
  TOOL_META[name] ?? {
    icon: "construct-outline",
    running: `Running ${name}`,
    done: `Ran ${name}`,
  };

export type ToolCallInfo = {
  toolCallId: string;
  toolName: string;
  argsText: string;
  args: Record<string, unknown>;
  result?: unknown;
};

/**
 * ChatGPT-style tool chip: spinner while the tool runs, then a tappable
 * card that expands to show the request and result payloads.
 */
export const ToolCallCard = memo(
  ({ tool, messageRunning }: { tool: ToolCallInfo; messageRunning: boolean }) => {
    const palette = usePalette();
    const [expanded, setExpanded] = useState(false);

    const meta = metaFor(tool.toolName);
    const running = tool.result === undefined && messageRunning;
    const interrupted = tool.result === undefined && !messageRunning;
    const subtitle = meta.subtitle?.(tool.args);

    return (
      <Animated.View
        layout={LinearTransition.springify().damping(30).stiffness(380)}
        entering={FadeIn.duration(200)}
        className="overflow-hidden rounded-2xl border border-line bg-surface"
      >
        <Pressable
          disabled={running}
          onPress={() => {
            haptics.tick();
            setExpanded((e) => !e);
          }}
          className="flex-row items-center gap-3 px-3 py-2.5 active:bg-surface-high"
        >
          <View className="h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-surface-high">
            <Ionicons name={meta.icon} size={16} color={palette.muted} />
          </View>
          <View className="flex-1">
            <Text className="text-[14.5px] font-medium text-foreground">
              {running ? `${meta.running}…` : interrupted ? `${meta.running} — interrupted` : meta.done}
            </Text>
            {subtitle ? (
              <Text numberOfLines={1} className="mt-[1px] text-[12.5px] text-muted">
                {subtitle}
              </Text>
            ) : null}
          </View>
          {running ? (
            <ActivityIndicator size="small" color={palette.muted} />
          ) : (
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={15}
              color={palette.faint}
            />
          )}
        </Pressable>

        {expanded && !running ? (
          <Animated.View entering={FadeIn.duration(150)} className="border-t border-line px-3 py-2.5">
            <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
              Request
            </Text>
            <Text className="text-[12px] leading-[17px] text-muted" style={{ fontFamily: MONO_FONT }}>
              {tool.argsText}
            </Text>
            {tool.result !== undefined ? (
              <>
                <Text className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-faint">
                  Result
                </Text>
                <Text className="text-[12px] leading-[17px] text-muted" style={{ fontFamily: MONO_FONT }}>
                  {JSON.stringify(tool.result, null, 2)}
                </Text>
              </>
            ) : null}
          </Animated.View>
        ) : null}
      </Animated.View>
    );
  },
  (prev, next) =>
    prev.tool.toolCallId === next.tool.toolCallId &&
    prev.tool.result === next.tool.result &&
    prev.messageRunning === next.messageRunning,
);
ToolCallCard.displayName = "ToolCallCard";
