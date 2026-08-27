import * as Clipboard from "expo-clipboard";
import { memo, useMemo, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { haptics } from "@/lib/haptics";
import { parseBlocks, type Block, type InlineSpan } from "@/markdown/parse";

export const MONO_FONT = Platform.select({ ios: "Menlo", default: "monospace" });

// ---------------------------------------------------------------------------
// Inline spans
// ---------------------------------------------------------------------------

const InlineSpans = ({ spans, inherit }: { spans: InlineSpan[]; inherit?: string }) => (
  <>
    {spans.map((span, i) => {
      switch (span.kind) {
        case "text":
          return span.text ? <Text key={i}>{span.text}</Text> : null;
        case "bold":
          return (
            <Text key={i} className="font-semibold">
              <InlineSpans spans={span.children} />
            </Text>
          );
        case "italic":
          return (
            <Text key={i} className="italic">
              <InlineSpans spans={span.children} />
            </Text>
          );
        case "bolditalic":
          return (
            <Text key={i} className="font-semibold italic">
              <InlineSpans spans={span.children} />
            </Text>
          );
        case "strike":
          return (
            <Text key={i} className="line-through text-muted">
              <InlineSpans spans={span.children} />
            </Text>
          );
        case "code":
          return (
            <Text
              key={i}
              className={`bg-surface-high text-[15px] text-foreground ${inherit ?? ""}`}
              style={{ fontFamily: MONO_FONT }}
            >
              {" "}
              {span.text}{" "}
            </Text>
          );
        case "link":
          return (
            <Text
              key={i}
              className="text-accent underline"
              suppressHighlighting
              onPress={() => {
                Linking.openURL(span.url).catch(() => {});
              }}
            >
              <InlineSpans spans={span.children} />
            </Text>
          );
      }
    })}
  </>
);

// ---------------------------------------------------------------------------
// Code block
// ---------------------------------------------------------------------------

const CodeBlock = ({ lang, content }: { lang: string; content: string }) => {
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    Clipboard.setStringAsync(content).catch(() => {});
    haptics.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <View className="overflow-hidden rounded-2xl bg-code-bg">
      <View className="flex-row items-center justify-between border-b border-code-chrome px-4 py-2">
        <Text className="text-[12px] text-code-fg opacity-60" style={{ fontFamily: MONO_FONT }}>
          {lang || "code"}
        </Text>
        <Pressable onPress={onCopy} hitSlop={10} className="flex-row items-center gap-1 active:opacity-60">
          <Ionicons name={copied ? "checkmark" : "copy-outline"} size={13} color="#b8b5ab" />
          <Text className="text-[12px] text-code-fg opacity-60">{copied ? "Copied" : "Copy"}</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 14 }}
      >
        <Text
          className="text-[13.5px] leading-[21px] text-code-fg"
          style={{ fontFamily: MONO_FONT }}
        >
          {content}
        </Text>
      </ScrollView>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

const TableBlock = ({ block }: { block: Extract<Block, { type: "table" }> }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
    <View className="overflow-hidden rounded-xl border border-line">
      <View className="flex-row border-b border-line bg-surface-high">
        {block.header.map((cell, c) => (
          <View key={c} className="min-w-[96px] max-w-[220px] flex-1 px-3 py-2">
            <Text className="text-[14px] font-semibold text-foreground">
              <InlineSpans spans={cell} />
            </Text>
          </View>
        ))}
      </View>
      {block.rows.map((row, r) => (
        <View key={r} className={`flex-row ${r > 0 ? "border-t border-line" : ""}`}>
          {row.map((cell, c) => (
            <View key={c} className="min-w-[96px] max-w-[220px] flex-1 px-3 py-2">
              <Text className="text-[14px] leading-[20px] text-foreground">
                <InlineSpans spans={cell} />
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  </ScrollView>
);

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const BODY_CLASS = "text-[16.5px] leading-[26px] text-foreground";

const HEADING_CLASS: Record<number, string> = {
  1: "text-[23px] leading-[30px] font-bold text-foreground",
  2: "text-[20px] leading-[27px] font-bold text-foreground",
  3: "text-[17.5px] leading-[24px] font-semibold text-foreground",
  4: "text-[16.5px] leading-[23px] font-semibold text-foreground",
};

const BlockView = ({ block }: { block: Block }) => {
  switch (block.type) {
    case "paragraph":
      return (
        <Text className={BODY_CLASS}>
          <InlineSpans spans={block.spans} />
        </Text>
      );
    case "heading":
      return (
        <Text className={HEADING_CLASS[block.level]}>
          <InlineSpans spans={block.spans} />
        </Text>
      );
    case "code":
      return <CodeBlock lang={block.lang} content={block.content} />;
    case "quote":
      return (
        <View className="flex-row">
          <View className="w-[3px] self-stretch rounded-full bg-line-strong" />
          <Text className={`${BODY_CLASS} flex-1 pl-3.5 text-muted`}>
            <InlineSpans spans={block.spans} />
          </Text>
        </View>
      );
    case "list":
      return (
        <View className="gap-[7px]">
          {block.items.map((item, idx) => (
            <View key={idx} className="flex-row" style={{ paddingLeft: item.depth * 20 }}>
              <Text className={`${BODY_CLASS} ${item.ordered ? "min-w-[24px]" : "w-[22px]"} text-muted`}>
                {item.marker}
              </Text>
              <Text className={`${BODY_CLASS} flex-1`}>
                <InlineSpans spans={item.spans} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "hr":
      return <View className="h-px bg-line" />;
    case "table":
      return <TableBlock block={block} />;
  }
};

/**
 * Memoized per-block renderer. During streaming only the final block's
 * signature changes, so completed blocks skip re-rendering entirely.
 */
const MemoBlock = memo(
  ({ block }: { block: Block; sig: string }) => <BlockView block={block} />,
  (prev, next) => prev.sig === next.sig,
);
MemoBlock.displayName = "MemoBlock";

export const MarkdownView = ({ text }: { text: string }) => {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <View className="gap-[14px]">
      {blocks.map((block, i) => (
        <MemoBlock key={i} block={block} sig={JSON.stringify(block)} />
      ))}
    </View>
  );
};
